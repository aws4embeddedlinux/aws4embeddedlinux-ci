# renesas example
based on https://elinux.org/R-Car/Boards/Yocto-Gen3/v5.9.0

To build a image containing the proprietary graphics and multimedia drivers from Renesas.
You need to download Multimedia and Graphics library and related Linux drivers, please from the following link:

https://www.renesas.com/us/en/application/automotive/r-car-h3-m3-h2-m2-e2-documents-software

Download two files:

R-Car_Gen3_Series_Evaluation_Software_Package_for_Linux-20220121.zip
R-Car_Gen3_Series_Evaluation_Software_Package_of_Linux_Drivers-20220121.zip


Graphic drivers are required for Wayland. Multimedia drivers are optional.

Put them into the proprietary folder in the root of the source repo, after deploying the build pipeline and uncomment the #TODO in the build.sh.
