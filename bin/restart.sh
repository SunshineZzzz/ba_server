#!/bin/sh

set -eo pipefail

_cur_path=$(dirname $(readlink -f $0))

sh ${_cur_path}/stop.sh
sh ${_cur_path}/start.sh