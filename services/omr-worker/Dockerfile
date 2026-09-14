# Dedicated Audiveris OMR worker for MusAI Piece Studio.
# Build: docker build -t musai-omr-worker ./services/omr-worker
# Run:   docker run --rm -p 8090:8090 musai-omr-worker
#
# Audiveris is installed from the official Ubuntu .deb release so the image
# can actually run batch PDF/PNG/JPG → MusicXML without a manual COPY step.

FROM eclipse-temurin:17-jre-jammy

ARG AUDIVERIS_VERSION=5.11.0
ARG AUDIVERIS_DEB=Audiveris-${AUDIVERIS_VERSION}-ubuntu22.04-x86_64.deb

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    poppler-utils \
    unzip \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && curl -fsSL -o /tmp/audiveris.deb \
    "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/${AUDIVERIS_DEB}" \
  && apt-get install -y --no-install-recommends /tmp/audiveris.deb \
  && rm -f /tmp/audiveris.deb \
  && rm -rf /var/lib/apt/lists/*

ENV AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris
ENV PORT=8090
ENV OMR_HOST=0.0.0.0
ENV OMR_DPI=300
ENV JAVA_TOOL_OPTIONS=-Djava.awt.headless=true

WORKDIR /app
COPY package.json ./
COPY src ./src

EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8090/healthz || exit 1

CMD ["node", "src/server.mjs"]
