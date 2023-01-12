#!/bin/sh
nodemon --watch 'src' \
        -e ts,tsx \
        --exec "./scripts/dev.sh"