#!/usr/bin/env bash
# Usage: scripts/upload-photos.sh <folder> [place]
# Uploads every image in <folder> to the family-frame-photos R2 bucket, named
# YYYY-MM-DD[_Place][_p][~HHMMSS].ext. Date comes from EXIF, else from a YYYYMMDD in the file name,
# else from the file's modified date (with a warning).
# Needs `brew install exiftool`. Resize first if they're huge: ~1600px wide is plenty for the frame.
set -euo pipefail
dir=${1:?usage: upload-photos.sh <folder> [place]}
place=${2:+_${2// /-}}
bucket=${PHOTOS_BUCKET:-family-frame-photos}

fd -e jpg -e jpeg -e png -e webp -e avif . "$dir" -0 | while IFS= read -r -d '' f; do
  read -r w h < <(exiftool -s3 -ImageWidth -ImageHeight "$f" | tr '\n' ' '; echo)
  stamp=$(exiftool -s3 -d '%Y-%m-%d %H%M%S' -DateTimeOriginal "$f")
  date=${stamp% *}; time=${stamp#* }
  if [[ -z "$stamp" ]]; then
    date=""; time=""
    if [[ "$(basename "$f")" =~ (20[0-9]{2})([01][0-9])([0-3][0-9]) ]]; then
      date="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
    fi
  fi
  if [[ -z "$date" ]]; then
    # Last resort: file modified date (may be the download date, not the photo date)
    date=$(exiftool -s3 -d '%Y-%m-%d' -FileModifyDate "$f")
    [[ -n "$date" ]] && echo "warn (no EXIF or filename date, using file date $date): $f" >&2
  fi
  if [[ -z "$date" ]]; then echo "skip (no date at all): $f" >&2; continue; fi
  # EXIF Orientation 5-8 means the browser displays the image rotated 90deg, so swap w/h
  rot=$(exiftool -s3 -n -Orientation "$f")
  if [[ "$rot" =~ ^[5-8]$ ]]; then t=$w; w=$h; h=$t; fi
  o=""; [[ "$h" -gt "$w" ]] && o="_p"
  ext=$(echo "${f##*.}" | tr 'A-Z' 'a-z')
  key="${date}${place}${o}~${time:-$RANDOM}.${ext}"
  echo "$f -> $key"
  (cd dashboard && npx wrangler r2 object put "$bucket/$key" --file "$f" --remote </dev/null)  # </dev/null: npx would otherwise eat the rest of the file list from the pipe
done
