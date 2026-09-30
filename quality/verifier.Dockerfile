FROM ghcr.io/jdx/mise:2026.9.17-debian@sha256:96b00319506c7ae46d2a561ba7da60723c723327d796334847c2802827cc6ec5

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libatomic1=14.2.0-19 \
    && rm -rf /var/lib/apt/lists/*
