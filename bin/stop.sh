#!/bin/sh

set -eo pipefail

_cur_path=$(dirname $(readlink -f $0))

function getpids() {
	ps fx | grep -E "$1" | grep -v grep | gawk '{print $1}'
}

pids=`getpids "node .* -tag baServer"`
for i in $pids; do
	kill -2 $i
done