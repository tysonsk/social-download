#!/usr/bin/env bash

# Download yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
chmod +x yt-dlp

# Download ffmpeg binary
echo "Downloading ffmpeg..."
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg.tar.xz
tar -xf ffmpeg.tar.xz
mv ffmpeg-*-static/ffmpeg ffmpeg
mv ffmpeg-*-static/ffprobe ffprobe
chmod +x ffmpeg ffprobe
rm -rf ffmpeg-*-static ffmpeg.tar.xz

# Install Node dependencies
npm install

echo "Build complete!"
