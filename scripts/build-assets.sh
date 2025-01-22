#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

WD="$SCRIPTPATH/.."

# create a source-zip where all the source-repo folders will be stored as zip
mkdir -p $WD/source-zip

# loop trough the source-repo folders
declare -a source_repos=(base-image kas meta-aws-demo nxp-imx poky poky-ami renesas)
for pipeline in "${source_repos[@]}"
do
  if [ -f $WD/source-zip/$pipeline/source-$pipeline.zip ]; then 
    rm -rf $WD/source-zip/$pipeline
  fi
  mkdir -p $WD/source-zip/$pipeline
  cd $WD/source-repo/$pipeline
  # create a zip with the source repo content for the specific immage
  zip -q -o $WD/source-zip/$pipeline/source-$pipeline.zip -r *
done

# copy the folders into th dist folder
if [ -d $WD/dist/scripts ]; then rm -rf $WD/dist/scripts; fi 
if [ -d $WD/dist/source-repo ]; then rm -rf $WD/dist/source-repo; fi 
if [ -d $WD/dist/source-zip ]; then rm -rf $WD/dist/source-zip; fi 

mkdir -p $WD/dist/scripts
mkdir -p $WD/dist/source-repo
mkdir -p $WD/dist/source-zip

cp -r $WD/scripts $WD/dist
cp -r $WD/source-repo $WD/dist
cp -r $WD/source-zip $WD/dist
