#!/bin/bash

SCRIPTPATH="$( cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P )"

WD="$SCRIPTPATH/.."

# copy the folders into th dist folder
if [ -d $WD/dist/source-repo ]; then rm -rf $WD/dist/source-repo; fi 
mkdir -p $WD/dist/source-repo
cp -r $WD/source-repo $WD/dist
