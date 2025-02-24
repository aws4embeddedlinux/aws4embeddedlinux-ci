#!/usr/bin/env bash
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

set -eo pipefail
[ "$DEBUG" == 'true' ] && set -x

ARGC=$#
if [ $ARGC -lt 6 ]; then
    echo "ERROR: missing args "
    echo "  1:IMPORT_BUCKET_NAME"
    echo "  2:AMI_DISK_SIZE_GB"
    echo "  3:IMAGE_NAME"
    echo "  4:MACHINE_NAME"
    echo "  5:TMPDIR"
    echo "  6:ROLE NAME"
    echo "  7:IMAGE_EXTEN"
    echo "  8:TESTDATA_JSON_EXTEN"
    echo "  9:PIPELINE_PROJECT_NAME"
    exit 1
fi

for arg in "$@"
do
   key=$(echo "$arg" | cut -f1 -d=)

   len=${#key}
   val="${arg:$len+1}"

   export "$key"="$val"
done

# IMPORT_BUCKET_NAME=$1
# AMI_DISK_SIZE_GB=$2
# IMAGE_NAME=$3
# MACHINE_NAME=$4
TMPDIR=${TMPDIR:-build/tmp}
# ROLE_NAME=$6
IMAGE_EXTEN=${IMAGE_EXTEN:-}
TESTDATA_JSON_EXTEN=${TESTDATA_JSON_EXTEN:-}
# PIPELINE_PROJECT_NAME=${9:-}

CREATED_BY_TAG="aws4embeddedlinux-ci"
IMG_DIR="${TMPDIR}/deploy/images/${MACHINE_NAME}"

TESTDATA_JSON="${IMG_DIR}/${IMAGE_NAME}-${MACHINE_NAME}${TESTDATA_JSON_EXTEN}.testdata.json"


echo "Input parameters:"
echo "  1:IMPORT_BUCKET_NAME : $IMPORT_BUCKET_NAME"
echo "  2:AMI_DISK_SIZE_GB : $AMI_DISK_SIZE_GB"
echo "  3:IMAGE_NAME : $IMAGE_NAME"
echo "  4:MACHINE_NAME : $MACHINE_NAME"
echo "  5:TMPDIR : $TMPDIR"
echo "  6:ROLE NAME : $ROLE"
echo "  7:IMAGE_EXTEN : $IMAGE_EXTEN"
echo "  8:TESTDATA_JSON_EXTEN : $TESTDATA_JSON_EXTEN"
echo "  9:PIPELINE_PROJECT_NAME : $PIPELINE_PROJECT_NAME"

DISTRO=$(jq -r '.DISTRO' "$TESTDATA_JSON")
DISTRO_CODENAME=$(jq -r '.DISTRO_CODENAME' "$TESTDATA_JSON")
DISTRO_NAME=$(jq -r '.DISTRO_NAME' "$TESTDATA_JSON")
DISTRO_VERSION=$(jq -r '.DISTRO_VERSION' "$TESTDATA_JSON")
BUILDNAME=$(jq -r '.BUILDNAME' "$TESTDATA_JSON")
TARGET_ARCH=$(jq -r '.TARGET_ARCH' "$TESTDATA_JSON")
IMAGE_NAME=$(jq -r '.IMAGE_NAME' "$TESTDATA_JSON")
IMAGE_ROOTFS_SIZE=$(jq -r '.IMAGE_ROOTFS_SIZE' "$TESTDATA_JSON")

echo DISTRO="$DISTRO"
echo DISTRO_CODENAME="$DISTRO_CODENAME"
echo DISTRO_NAME="$DISTRO_NAME"
echo DISTRO_VERSION="$DISTRO_VERSION"
echo BUILDNAME="$BUILDNAME"
echo TARGET_ARCH="$TARGET_ARCH"
echo IMAGE_ROOTFS_SIZE="$IMAGE_ROOTFS_SIZE"
echo AMI_DISK_SIZE_GB="$AMI_DISK_SIZE_GB"




echo "Pushing image ${IMAGE_NAME}${IMAGE_EXTEN}.wic.vhd to s3://${IMPORT_BUCKET_NAME}"
aws s3 cp "${IMG_DIR}/${IMAGE_NAME}${IMAGE_EXTEN}.wic.vhd" "s3://${IMPORT_BUCKET_NAME}"

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

command_output=$(aws ec2 import-snapshot \
    --disk-container "file://image-import.json" \
    --tag-specifications "ResourceType=import-snapshot-task,Tags=[{Key=CreatedBy,Value=$CREATED_BY_TAG},{Key=PipelineProject,Value=$PIPELINE_PROJECT_NAME}]" \
    --role-name "$ROLE_NAME" --encrypted
)
command_exit_code=$?

if [[ "$command_exit_code" -ne 0 ]]; then
  echo "Import Failed: ${command_output}, exiting." exit 2;
fi

IMPORT_TASK_ID=$(echo "${command_output}" | jq -r '.ImportTaskId')

IMPORT_STATUS=$(aws ec2 describe-import-snapshot-tasks --import-task-ids "$IMPORT_TASK_ID" --query 'ImportSnapshotTasks[].SnapshotTaskDetail.Status' --output text)
x=0
rm image-import.json
echo "$IMPORT_STATUS"
while [ "$IMPORT_STATUS" = "active" ] && [ $x -lt 120 ]
do
  IMPORT_STATUS=$(aws ec2 describe-import-snapshot-tasks --import-task-ids "$IMPORT_TASK_ID" --query 'ImportSnapshotTasks[].SnapshotTaskDetail.Status' --output text)
  IMPORT_STATUS_MSG=$(aws ec2 describe-import-snapshot-tasks --import-task-ids "$IMPORT_TASK_ID" --query 'ImportSnapshotTasks[].SnapshotTaskDetail.StatusMessage' --output text)
  echo "Import Status: ${IMPORT_STATUS} / ${IMPORT_STATUS_MSG}"
  x=$(( x + 1 ))
  sleep 15
done
if [ $x -eq 120 ]; then
    echo "ERROR: Import task taking too long, exiting..."; exit 1;
elif [ "$IMPORT_STATUS" = "completed" ]; then
    echo "Import completed Successfully"
else
    echo "Import Failed, exiting"; exit 2;
fi

SNAPSHOT_ID=$(aws ec2 describe-import-snapshot-tasks --import-task-ids "$IMPORT_TASK_ID" --query 'ImportSnapshotTasks[].SnapshotTaskDetail.SnapshotId' --output text)

aws ec2 wait snapshot-completed --snapshot-ids "$SNAPSHOT_ID"

if [[ "$TARGET_ARCH" == "x86_64" ]]; then
    ARCHITECTURE="x86_64"
elif [[ "$TARGET_ARCH" == "aarch64" ]]; then
    ARCHITECTURE="arm64"
else
    echo "Architecture not supported"
    exit 1
fi
DESCRIPTION=$(echo "PIPELINE_PROJECT_NAME=$PIPELINE_PROJECT_NAME;DISTRO=$DISTRO;DISTRO_CODENAME=$DISTRO_CODENAME;DISTRO_NAME=$DISTRO_NAME;DISTRO_VERSION=$DISTRO_VERSION;BUILDNAME=$BUILDNAME;TARGET_ARCH=$ARCHITECTURE;IMAGE_NAME=$IMAGE_NAME" | cut -c -255)

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
IMAGE_ID=$(aws ec2 describe-images --filters "Name=name,Values=${AMI_NAME}" --query 'Images[].ImageId' --output text)
if [ "$IMAGE_ID" != "" ]; then
    echo "Deregistering existing image $IMAGE_ID"
    aws ec2 deregister-image --image-id "${IMAGE_ID}" > /dev/null 2>&1
fi
echo "Registering AMI with Snapshot $SNAPSHOT_ID with parameters:"
echo "AMI name: $AMI_NAME"
more register-ami.json
AMI_ID=$(aws ec2 register-image \
    --name "${AMI_NAME}" \
    --cli-input-json="file://register-ami.json" \
    --tag-specifications "ResourceType=image,Tags=[{Key=Name,Value=$PIPELINE_PROJECT_NAME},{Key=CreatedBy,Value=$CREATED_BY_TAG},{Key=PipelineProject,Value=$PIPELINE_PROJECT_NAME}]" \
    --query 'ImageId' \
    --output text
)
echo "Registered AMI ID: $AMI_ID"
rm register-ami.json

echo "Backing up AMI with ID $AMI_ID in S3"
OBJECT_KEY=$(aws ec2 create-store-image-task --image-id "$AMI_ID" --bucket "${IMPORT_BUCKET_NAME}" --query 'ObjectKey' --output text)
echo "Backup AMI object key : $OBJECT_KEY"
BACKUP_STATUS=$(aws ec2 describe-store-image-tasks --image-ids "$AMI_ID" --query 'StoreImageTaskResults[].StoreTaskState' --output text)
x=0
echo "Verifying AMI backup status: $BACKUP_STATUS"
while [ "$BACKUP_STATUS" = "InProgress" ] && [ $x -lt 120 ]
do
  BACKUP_STATUS=$(aws ec2 describe-store-image-tasks --image-ids "$AMI_ID" --query 'StoreImageTaskResults[].StoreTaskState' --output text)
  PROGRESS_PERCENTAGE=$(aws ec2 describe-store-image-tasks --image-ids "$AMI_ID" --query 'StoreImageTaskResults[].ProgressPercentage' --output text)
  echo "Backup Status: ${BACKUP_STATUS} / ${PROGRESS_PERCENTAGE} % completed."
  x=$(( x + 1 ))
  sleep 15
done
if [ $x -eq 120 ]; then
    echo "ERROR: Backup taking too long, exiting..."
    exit 1
elif [ "$BACKUP_STATUS" = "Completed" ]; then
    echo "Backup completed Successfully"
else
    echo "Backup Failed, exiting"
    exit 2
fi
