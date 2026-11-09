FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive

# LiteRT-LM / Rasterio に必要な Linux 共有ライブラリ
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ルート候補のテキスト比較に使う270Mモデルをビルド時に同梱。
# 取得に失敗したイメージを正常起動させない（本番でのサイレントなヒューリスティック退行を防止）。
RUN mkdir -p /app/models && \
    python -c "from huggingface_hub import hf_hub_download; import shutil; p = hf_hub_download(repo_id='litert-community/embeddinggemma-2-text-270m-litert-lm', filename='embeddinggemma-2-text-270m.litertlm'); shutil.copy(p, '/app/models/embeddinggemma-2-text-270m.litertlm')" && \
    test -s /app/models/embeddinggemma-2-text-270m.litertlm

COPY ./app ./app

# 事前配置されたテキストモデル。リクエスト中の重いダウンロードは禁止。
ENV EMBEDDINGGEMMA_MODEL_PATH=/app/models/embeddinggemma-2-text-270m.litertlm
ENV PORT=8080
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
