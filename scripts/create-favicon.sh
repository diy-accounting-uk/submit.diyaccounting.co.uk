#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# Purpose: Generate a favicon from an image and save it as ./public/favicon.ico
# Requires: ImageMagick
# Usage: ./scripts/create-favicon.sh <path-to-image>
# e.g.
# $ ./scripts/create-favicon.sh brand-usage/intentïon-mesh-black-#000000-64x64.png

# Check if the input file is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path-to-image>"
    exit 1
fi

# Input image path
input_image_filepath="$1"

# Output favicon file
output_favicon_filepath="./web/public/favicon.ico"

# Create multiple sizes of the favicon
convert "${input_image_filepath?}" \
    \( -clone 0 -resize 16x16 \) \
    \( -clone 0 -resize 32x32 \) \
    \( -clone 0 -resize 48x48 \) \
    \( -clone 0 -resize 64x64 \) \
    -delete 0 -alpha on -background transparent -colors 256 "${output_favicon_filepath?}"

echo "Favicon created at ${output_favicon_filepath?}"
