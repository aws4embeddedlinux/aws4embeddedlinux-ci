FROM public.ecr.aws/lts/ubuntu:22.04_stable AS base

# This is required to avoid prompts when updating from Apt.
ARG DEBIAN_FRONTEND=noninteractive

# Install Required Packages for the Build Host
RUN apt-get -qq update && apt-get -qq install -y --no-install-recommends \
    gawk wget git diffstat unzip texinfo gcc build-essential chrpath \
    socat cpio python3 python3-pip python3-pexpect xz-utils debianutils \
    iputils-ping python3-git python3-jinja2 libegl1-mesa libsdl1.2-dev \
    python3-subunit mesa-common-dev zstd liblz4-tool file locales xterm sudo

# Install packages used elsewhere in the build
RUN apt-get -qq install -y --no-install-recommends \
    uuid-runtime sysstat iproute2 openssh-client curl python-is-python3 \
    parted mtools dosfstools jq gpg gpg-agent qemu-utils rsync

# install repo tool
RUN curl https://storage.googleapis.com/git-repo-downloads/repo > /bin/repo
RUN chmod a+rx /bin/repo

# Install aws cli v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
RUN unzip -qq /tmp/awscliv2.zip -d /tmp
RUN /tmp/aws/install

# install kas tool
RUN pip3 install -q PyYAML==5.3.1 -q && pip3 install -q kas==4.0.0

RUN locale-gen en_US.UTF-8

# Create a non-root user to build.
RUN groupadd -g 1000 yoctouser
RUN useradd -u 1000 -g 1000 -m yoctouser

# These will be mount points for an EFS volume. This allows the cache to be reused.
RUN mkdir -p /nfs && chown -R yoctouser /nfs && chmod -R 755 /nfs

RUN sudo -u yoctouser bash -c 'git config --global user.email "yoctouser@example.com"'
RUN sudo -u yoctouser bash -c 'git config --global user.name "yoctouser"'
RUN sudo -u yoctouser bash -c 'git config --global init.defaultBranch main'

ENV TMP_DIR=/tmp
ENV SSTATE_DIR=/nfs/sstate-cache
ENV DL_DIR=/nfs/downloads
ENV OUTPUT_DIR=/nfs/build-output
ENV BB_ENV_PASSTHROUGH_ADDITIONS="SSTATE_DIR DL_DIR"

USER yoctouser
