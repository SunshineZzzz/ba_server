#!/bin/sh

set -eo pipefail

_cur_path=$(dirname $(readlink -f $0))

cd ${_cur_path}/../app/

export NODE_ENV=production
# node app.js -tag baServer
nohup node app.js -tag baServer >/dev/null 2>&1 &