#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mode=${1:-}
if [[ $mode == --check || $mode == --sync-dois ]]; then
	issue=${2:-25.1}
else
	issue=${1:-}
	if [[ -z $issue ]]; then
		read -r -p "JCRT issue [25.1]: " issue
		issue=${issue:-25.1}
	fi
fi

if [[ ! $issue =~ ^[0-9]{2}\.[0-9]+$ ]]; then
	printf 'Issue must look like 25.1, not %s\n' "$issue" >&2
	exit 1
fi

metadata="archives/$issue.metadata.json"
archive="archives/$issue.zip"
profile="images/$issue.profile.png"
slug="jcrt-${issue/./}"
title="JCRT $issue"
description="$title"
website="https://jcrt.org/archives/$issue/"

sync_dois() {
	local log=$1 source_dir="../jcrt-v2/content/archives/$issue" record recid doi existing target
	local api_root=${KCWORKS_API_ROOT:-https://works.hcommons.org/api}
	local expected updated=0 targets=()
	[[ -f $log ]] || { printf 'Missing import response: %s\n' "$log" >&2; return 1; }
	[[ -d $source_dir ]] || { printf 'Missing source directory: %s\n' "$source_dir" >&2; return 1; }
	expected=$(jq length "$metadata")
	jq -e --argjson expected "$expected" '((.errors // []) | length) == 0 and ((.data // []) | length) == $expected' "$log" >/dev/null || {
		printf 'Refusing DOI sync: %s is not a complete %s-record success.\n' "$log" "$expected" >&2
		return 1
	}
	while IFS= read -r record_id; do
		record=$(curl -fsS "$api_root/records/$record_id")
		recid=$(jq -r '.metadata.identifiers[] | select(.scheme == "import-recid") | .identifier' <<< "$record")
		doi=$(jq -r '.pids.doi.identifier // empty' <<< "$record")
		[[ -n $recid && -n $doi ]] || { printf 'Record %s lacks an import-recid or DOI.\n' "$record_id" >&2; return 1; }
		targets=()
		while IFS= read -r target; do [[ -n $target ]] && targets+=("$target"); done < <(rg -l "^nanoid: [\"']?$recid[\"']?$" "$source_dir" -g '*.md' || true)
		(( ${#targets[@]} == 1 )) || { printf 'Expected one Markdown file for %s; found %s.\n' "$recid" "${#targets[@]}" >&2; return 1; }
		target=${targets[0]}
		existing=$(sed -n 's/^doi:[[:space:]]*//p' "$target" | head -1 | tr -d "\"'")
		[[ -z $existing || $existing == "$doi" ]] || { printf '%s already has different DOI %s.\n' "$target" "$existing" >&2; return 1; }
		if [[ $existing != "$doi" ]]; then
			if [[ ${JCRT_DOI_DRY_RUN:-0} != 1 ]]; then
				DOI=$doi perl -0pi -e 's/^doi:[^\r\n]*$/doi: "$ENV{DOI}"/m' "$target"
			fi
			((updated += 1))
		fi
		printf '  %s -> %s\n' "$(basename "$target")" "$doi"
	done < <(jq -er '.data[].record_id' "$log")
	printf '%s DOI front matter entries %s.\n' "$updated" "$([[ ${JCRT_DOI_DRY_RUN:-0} == 1 ]] && printf 'would be updated' || printf updated)"
}

[[ -f $metadata ]] || { printf 'Missing %s\n' "$metadata" >&2; exit 1; }
[[ -f $archive ]] || { printf 'Missing %s\n' "$archive" >&2; exit 1; }
if [[ $mode == --sync-dois ]]; then
	sync_dois "_logs/$issue.log"
	exit
fi
python=.venv/bin/python
[[ -x $python ]] || python=python3
"$python" -c 'import requests' 2>/dev/null || { printf 'Missing Python dependency. Run: python3 -m venv .venv && .venv/bin/pip install requests\n' >&2; exit 1; }

if [[ ! -f $profile ]]; then
	command -v rsvg-convert >/dev/null || { printf 'librsvg is required to render %s\n' "$profile" >&2; exit 1; }
	command -v magick >/dev/null || { printf 'ImageMagick is required to create %s\n' "$profile" >&2; exit 1; }
	svg_issue=$(sed -n 's/.*<text[^>]*>\([^<]*\)<\/text>.*/\1/p' images/jcrt-issue.svg)
	[[ $svg_issue == "$issue" ]] || { printf 'images/jcrt-issue.svg says %s, not %s.\n' "$svg_issue" "$issue" >&2; exit 1; }
	template_png=$(mktemp "${TMPDIR:-/tmp}/jcrt-profile.XXXXXX.png")
	trap 'rm -f "$template_png"' EXIT
	rsvg-convert -w 800 -h 800 -o "$template_png" images/jcrt-issue.svg
	magick "$template_png" -background white -alpha remove -alpha off -strip \
		-define png:compression-level=9 -define png:compression-strategy=1 \
		-units PixelsPerInch -density 72 "$profile"
fi

profile_bytes=$(wc -c < "$profile" | tr -d ' ')
if (( profile_bytes > 1047552 )); then
	printf '%s is %s bytes; KC Works requires at least 1 KB below 1 MiB.\n' "$profile" "$profile_bytes" >&2
	exit 1
fi
profile_info=$(sips -g pixelWidth -g pixelHeight -g dpiWidth -g dpiHeight "$profile")
profile_width=$(awk '/pixelWidth/{print $2}' <<< "$profile_info")
profile_height=$(awk '/pixelHeight/{print $2}' <<< "$profile_info")
profile_dpi=$(awk '/dpiWidth/{print int($2)}' <<< "$profile_info")
[[ $profile_dpi == 72 ]] || { printf '%s must be 72 DPI.\n' "$profile" >&2; exit 1; }

printf '\n%s\n' "$title"
printf '  collection: https://works.hcommons.org/collections/%s\n' "$slug"
printf '  metadata:   %s (%s records)\n' "$metadata" "$(jq length "$metadata")"
printf '  files:      %s\n' "$archive"
printf '  profile:    %s (%s bytes, %sx%s, 72 DPI)\n\n' "$profile" "$profile_bytes" "$profile_width" "$profile_height"
jq -r '.[] | "  - \(.metadata.title) [\(.files.entries | keys | join(", "))]"' "$metadata"

npm run import:preflight -- "$issue"

if [[ $mode == --check ]]; then
	printf '\nLocal checks passed; no KC Works requests were made.\n'
	exit 0
fi

[[ -f .env ]] || { printf '\nCreate .env from the documented values first.\n' >&2; exit 1; }
preset_api_key=${KCWORKS_IMPORT_API_KEY:-}
set -a
# shellcheck disable=SC1091
source .env
set +a

api_key=${preset_api_key:-${KCWORKS_IMPORT_API_KEY:-}}
output=${KCWORKS_IMPORT_OUTPUT_PATH:-}
[[ -n $output ]] || output='_logs/{issue}.log'
output=${output/\{issue\}/$issue}
api_root=${KCWORKS_API_ROOT:-https://works.hcommons.org/api}
[[ -n $api_key ]] || { printf '\nSet KCWORKS_IMPORT_API_KEY in .env first.\n' >&2; exit 1; }
mkdir -p "$(dirname "$output")"

headers=(-H "Authorization: Bearer $api_key" -H 'Accept: application/json')
if collection=$(curl -fsS "${headers[@]}" "$api_root/communities/$slug" 2>/dev/null); then
	printf '\nCollection already exists: %s\n' "$(jq -r '.links.self_html' <<< "$collection")"
	read -r -p 'Continue with this collection? [y/N] ' answer
	[[ $answer =~ ^([Yy]|[Yy][Ee][Ss])$ ]] || exit 0
else
	read -r -p "Create public collection $title ($slug)? [y/N] " answer
	[[ $answer =~ ^([Yy]|[Yy][Ee][Ss])$ ]] || exit 0
	read -r -p "Description [$description]: " entered
	description=${entered:-$description}
	payload=$(jq -nc \
		--arg slug "$slug" --arg title "$title" --arg description "$description" --arg website "$website" \
		'{slug:$slug, metadata:{title:$title, description:$description, type:{id:"journal"}, website:$website}, access:{visibility:"public", members_visibility:"public", member_policy:"open", record_policy:"open", review_policy:"closed"}}')
	collection=$(curl -fsS "${headers[@]}" -H 'Content-Type: application/json' \
		-X POST -d "$payload" "$api_root/communities")
	printf 'Created %s\n' "$(jq -r '.links.self_html' <<< "$collection")"
fi

collection_id=$(jq -r '.id' <<< "$collection")
if [[ $(jq -r '.metadata.type.id // empty' <<< "$collection") != journal ]]; then
	payload=$(jq '{slug, metadata:(.metadata + {type:{id:"journal"}}), access}' <<< "$collection")
	collection=$(curl -fsS "${headers[@]}" -H 'Content-Type: application/json' \
		-X PUT -d "$payload" "$api_root/communities/$collection_id")
	printf 'Collection tagged as Journal.\n'
else
	printf 'Collection tag: Journal.\n'
fi

read -r -p "Upload $profile as the collection profile image? [y/N] " answer
if [[ $answer =~ ^([Yy]|[Yy][Ee][Ss])$ ]]; then
	curl -fsS "${headers[@]}" -H 'Content-Type: application/octet-stream' \
		-X PUT --data-binary "@$profile" "$api_root/communities/$collection_id/logo" >/dev/null
	printf 'Profile image uploaded.\n'
fi

members=$(curl -fsS "${headers[@]}" "$api_root/communities/$collection_id/members?size=100")
owner_id=$(jq -r '.hits.hits[] | select(.is_current_user and .role == "owner") | .member.id' <<< "$members")
[[ -n $owner_id ]] || { printf 'The token user is not this collection owner; stopping.\n' >&2; exit 1; }
owner_visible=$(jq -r '.hits.hits[] | select(.is_current_user and .role == "owner") | .visible' <<< "$members")
if [[ $owner_visible != true ]]; then
	payload=$(jq -nc --arg id "$owner_id" '{members:[{id:$id,type:"user"}],visible:true}')
	curl -fsS "${headers[@]}" -H 'Content-Type: application/json' \
		-X PUT -d "$payload" "$api_root/communities/$collection_id/members" >/dev/null
	printf 'Owner membership is now public.\n'
else
	printf 'Token user is owner and already public.\n'
fi

read -r -p "Import this metadata set and ZIP into $title now? [y/N] " answer
[[ $answer =~ ^([Yy]|[Yy][Ee][Ss])$ ]] || exit 0
KCWORKS_IMPORT_API_KEY=$api_key KCWORKS_IMPORT_OUTPUT_PATH=$output \
	"$python" kcworks_api_importer.py \
		--collection-id "$slug" --metadata "$metadata" --files "$archive"

printf '\nSyncing KC Works DOIs to jcrt-v2...\n'
sync_dois "$output"
printf '\nImport response: %s\nCollection: https://works.hcommons.org/collections/%s\n' "$output" "$slug"
read -r -p 'Review the collection and press Enter when human validation is complete. '
