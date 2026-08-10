FROM python:3.12-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN addgroup --system lexora && adduser --system --ingroup lexora lexora

FROM base AS production

RUN pip install --no-cache-dir \
    "fastapi==0.140.13" \
    "pydantic==2.13.4" \
    "uvicorn==0.52.0" \
    "pillow>=11.0.0"

COPY app/ ./app/
RUN rm -f /app/app/document/ocr.py /app/app/providers/local_ocr.py \
    && chown -R lexora:lexora /app

USER lexora
EXPOSE 8000

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS local-runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "paddlepaddle==3.2.2" \
    "fastapi==0.140.13" \
    "pydantic==2.13.4" \
    "uvicorn==0.52.0" \
    "paddleocr==3.7.0" \
    "opencv-contrib-python==4.10.0.84" \
    "python-multipart==0.0.32" \
    "pillow>=11.0.0"

COPY app/ ./app/

EXPOSE 8000
CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM local-runtime AS test

RUN pip install --no-cache-dir "pytest==9.1.1" "httpx>=0.27.0"
COPY tests/ ./tests/

CMD ["python", "-m", "pytest"]
