#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
set -eo pipefail
[ "$DEBUG" == 'true' ] && set -x

ARGC=$#
if [ $ARGC -lt 6 ]; then
    echo "ERROR: Please inform import bucket name as first argument and AMI disk size in GB as second, IMAGE_NAME as third, MACHINE_NAME as forth, TMPDIR as fifth and ROLE NAME as last."
    exit 1
fi
IMPORT_BUCKET_NAME=$1
AMI_DISK_SIZE_GB=$2
IMAGE_NAME=$3
MACHINE_NAME=$4
TMPDIR=${5:-build/tmp}
ROLE_NAME=$6
IMAGE_EXTEN=${7:-}
TESTDATA_JSON_EXTEN=${8:.rootfs}

CREATED_BY_TAG="aws4embeddedlinux-ci"
IMG_DIR="${TMPDIR}/deploy/images/${MACHINE_NAME}"

TESTDATA_JSON="${IMG_DIR}/${IMAGE_NAME}-${MACHINE_NAME}${TESTDATA_JSON_EXTEN}.testdata.json"

DISTRO=$(jq -r '.DISTRO' $TESTDATA_JSON)
DISTRO_CODENAME=$(jq -r '.DISTRO_CODENAME' $TESTDATA_JSON)
DISTRO_NAME=$(jq -r '.DISTRO_NAME' $TESTDATA_JSON)
DISTRO_VERSION=$(jq -r '.DISTRO_VERSION' $TESTDATA_JSON)
BUILDNAME=$(jq -r '.BUILDNAME' $TESTDATA_JSON)
TARGET_ARCH=$(jq -r '.TARGET_ARCH' $TESTDATA_JSON)
IMAGE_NAME=$(jq -r '.IMAGE_NAME' $TESTDATA_JSON)
IMAGE_ROOTFS_SIZE=$(jq -r '.IMAGE_ROOTFS_SIZE' $TESTDATA_JSON)


echo DISTRO=$DISTRO
echo DISTRO_CODENAME=$DISTRO_CODENAME
echo DISTRO_NAME=$DISTRO_NAME
echo DISTRO_VERSION=$DISTRO_VERSION
echo BUILDNAME=$BUILDNAME
echo TARGET_ARCH=$TARGET_ARCH
echo IMAGE_ROOTFS_SIZE=$IMAGE_ROOTFS_SIZE
echo AMI_DISK_SIZE_GB=$AMI_DISK_SIZE_GB


echo "Pushing image ${IMAGE_NAME}${IMAGE_EXTEN}.wic.vhd to s3://${IMPORT_BUCKET_NAME}"
aws s3 cp ${IMG_DIR}/${IMAGE_NAME}${IMAGE_EXTEN}.wic.vhd s3://${IMPORT_BUCKET_NAME}

cat <<EOF > image-import.json
{
    "Description": "ewaol docker image",
    "Format": "vhd",
    "UserBucket": {
        "S3Bucket": "${IMPORT_BUCKET_NAME}",
        "S3Key": "${IMAGE_NAME}${IMAGE_EXTEN}.wic.vhd"
    }
}
EOF
echo "Importing image file into snapshot "

command_output=$(aws ec2 import-snapshot --disk-container "file://image-import.json" --tag-specifications "ResourceType=import-snapshot-task,Tags=[{Key=CreatedBy,Value=$CREATED_BY_TAG}]" --role-name $ROLE_NAME )
command_exit_code=$?

if [[ "$command_exit_code" -ne 0 ]]; then
  echo "Import Failed: ${command_output}, exiting." exit 2;
fi

IMPORT_TASK_ID=$(echo "${command_output}" | jq -r '.ImportTaskId')

IMPORT_STATUS=$(aws ec2 describe-import-snapshot-tasks --import-task-ids $IMPORT_TASK_ID --query 'ImportSnapshotTasks[].SnapshotTaskDetail.Status' --output text)
x=0
rm image-import.json
echo $IMPORT_STATUS
while [ "$IMPORT_STATUS" = "active" ] && [ $x -lt 120 ]
do
  IMPORT_STATUS=$(aws ec2 describe-import-snapshot-tasks --import-task-ids $IMPORT_TASK_ID --query 'ImportSnapshotTasks[].SnapshotTaskDetail.Status' --output text)
  IMPORT_STATUS_MSG=$(aws ec2 describe-import-snapshot-tasks --import-task-ids $IMPORT_TASK_ID --query 'ImportSnapshotTasks[].SnapshotTaskDetail.StatusMessage' --output text)
  echo "Import Status: ${IMPORT_STATUS} / ${IMPORT_STATUS_MSG}"
  x=$(( $x + 1 ))
  sleep 15
done
if [ $x -eq 120 ]; then
    echo "ERROR: Import task taking too long, exiting..."; exit 1;
elif [ "$IMPORT_STATUS" = "completed" ]; then
    echo "Import completed Successfully"
else
    echo "Import Failed, exiting"; exit 2;
fi

SNAPSHOT_ID=$(aws ec2 describe-import-snapshot-tasks --import-task-ids $IMPORT_TASK_ID --query 'ImportSnapshotTasks[].SnapshotTaskDetail.SnapshotId' --output text)

aws ec2 wait snapshot-completed --snapshot-ids $SNAPSHOT_ID

if [[ "$TARGET_ARCH" == "x86_64" ]]; then
    ARCHITECTURE="x86_64"
elif [[ "$TARGET_ARCH" == "aarch64" ]]; then
    ARCHITECTURE="arm64"
else
    echo "Architecture not supported"
    exit 1
fi
DESCRIPTION=$(echo "DISTRO=$DISTRO;DISTRO_CODENAME=$DISTRO_CODENAME;DISTRO_NAME=$DISTRO_NAME;DISTRO_VERSION=$DISTRO_VERSION;BUILDNAME=$BUILDNAME;TARGET_ARCH=$ARCHITECTURE;IMAGE_NAME=$IMAGE_NAME" | cut -c -255)

cat <<EOF > register-ami.json
{
    "Architecture": "$ARCHITECTURE",
    "BlockDeviceMappings": [
        {
            "DeviceName": "/dev/sda1",
            "Ebs": {
                "DeleteOnTermination": true,
                "SnapshotId": "$SNAPSHOT_ID",
                "VolumeSize": ${AMI_DISK_SIZE_GB},
                "VolumeType": "gp2"
            }
        }
    ],
    "Description": "$DESCRIPTION",
    "RootDeviceName": "/dev/sda1",
    "BootMode": "uefi",
    "VirtualizationType": "hvm",
    "EnaSupport": true
}
EOF

AMI_NAME=$(echo "${IMAGE_NAME}-${DISTRO}-${DISTRO_CODENAME}-${DISTRO_VERSION}-${BUILDNAME}-${ARCHITECTURE}" | cut -c -128 | sed -e s/+/-/g)
IMAGE_ID=$(aws ec2 describe-images --filters Name=name,Values=${AMI_NAME} --query 'Images[].ImageId' --output text)
if [ "$IMAGE_ID" != "" ]; then
    echo "Deregistering existing image $IMAGE_ID"
    aws ec2 deregister-image --image-id ${IMAGE_ID} 2>&1 > /dev/null
fi
echo "Registering AMI with Snapshot $SNAPSHOT_ID"
AMI_ID=$(aws ec2 register-image --name ${AMI_NAME} --cli-input-json="file://register-ami.json" --query 'ImageId' --output text)
echo "AMI name: $AMI_NAME"
echo "AMI ID: $AMI_ID"
rm register-ami.json
