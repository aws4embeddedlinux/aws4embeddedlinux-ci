#!/bin/bash

set -e
export BOARD_LIST=("h3ulcb" "m3ulcb")
export TARGET_BOARD=$1
export PROPRIETARY_DIR="$(pwd)/proprietary"
WORK="$(pwd)/${TARGET_BOARD}"

export GFX_MMP_LIB=R-Car_Gen3_Series_Evaluation_Software_Package_for_Linux-20220121.zip
export GFX_MMP_DRIVER=R-Car_Gen3_Series_Evaluation_Software_Package_of_Linux_Drivers-20220121.zip

Usage () {
   echo "Usage: $0 \${TARGET_BOARD_NAME}"
   echo "BOARD_NAME list: "
   for i in ${BOARD_LIST[@]}; do echo "  - $i"; done
		        exit
}

# Check Param.
if ! `IFS=$'\n'; echo "${BOARD_LIST[*]}" | grep -qx "${TARGET_BOARD}"`; then
	    Usage
fi
mkdir -p "${WORK}"
cd "${WORK}"
# Clone basic Yocto layers in parallel
git clone git://git.yoctoproject.org/poky -b dunfell &
git clone git://git.openembedded.org/meta-openembedded -b dunfell &
git clone https://github.com/renesas-rcar/meta-renesas -b dunfell
# Wait for all clone operations
wait
# Switch to proper branches/commits
WORK_PROP_DIR="${WORK}/proprietary"
mkdir -p "${WORK_PROP_DIR}"
##TODO unzip -qo ${PROPRIETARY_DIR}/${GFX_MMP_LIB} -d ${WORK_PROP_DIR}
##TODO unzip -qo ${PROPRIETARY_DIR}/${GFX_MMP_DRIVER} -d ${WORK_PROP_DIR}
cd "${WORK}/meta-renesas"
sh meta-rcar-gen3/docs/sample/copyscript/copy_proprietary_softwares.sh -f "${WORK_PROP_DIR}"
cd "${WORK}"
source "poky/oe-init-build-env" "${WORK}/build"
#cp ${WORK}/meta-renesas/meta-rcar-gen3/docs/sample/conf/${TARGET_BOARD}/poky-gcc/bsp/*.conf ./conf/
#cp ${WORK}/meta-renesas/meta-rcar-gen3/docs/sample/conf/${TARGET_BOARD}/poky-gcc/gfx-only/*.conf ./conf/
cp "${WORK}/meta-renesas/meta-rcar-gen3/docs/sample/conf/${TARGET_BOARD}/poky-gcc/mmp/*.conf" ./conf
cd "${WORK}/build"
cp conf/local-wayland.conf conf/local.conf
echo 'BB_DANGLINGAPPENDS_WARNONLY ?= "true"' >> conf/local.conf

# without proprietary files this build does not
##TODO bitbake core-image-weston
bitbake core-image-minimal
