#!/bin/bash

if [ $# -ne 2 ]; then
    echo "Usage: $0 <md5cmd> <md5Index>";
    echo "macOS: $0 md5 4";
    echo "Linux: $0 md5sum 1";
    exit 0;
fi

MD5_CMD=$1
MD5_IDX=$2

OUTPUTSTR=""

for ver in generated/v*
do
    OUTPUTSTR+="**$(basename $ver)**\n"
    OUTPUTSTR+="|Filename|etag|\n"
    OUTPUTSTR+="|---|---|\n"

    for file in $ver/*.json
    do
        OUTPUTSTR+="|$(basename $file)|"
        fileEtag=$($MD5_CMD $file | cut -d ' ' -f $MD5_IDX)
        OUTPUTSTR+="$fileEtag|\n"
    done

    OUTPUTSTR+="\n"
done

echo -e $OUTPUTSTR
