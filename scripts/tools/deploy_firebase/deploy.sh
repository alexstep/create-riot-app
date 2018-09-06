#!/usr/bin/env bash -e

firebase="$PWD/node_modules/.bin/firebase"

$firebase login

file="./node_modules/firebaseinitied.txt"
if [ -f "$file" ]
	then
		echo ""
	else
		echo "firebaseinitied" > $file
		clear
		$firebase init || exit 1
fi

rm -rf "$PWD/./public"
cp -r "$PWD/../../../build" "$PWD/./public"

$firebase deploy

rm -rf `$PWD`./public