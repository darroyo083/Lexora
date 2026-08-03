FROM python:3.12-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir paddlepaddle==3.2.2

COPY pyproject.toml .
RUN pip install --no-cache-dir "fastapi==0.140.13" "pydantic==2.13.4" "uvicorn==0.52.0" "paddleocr==3.7.0" "opencv-contrib-python==4.10.0.84" "python-multipart==0.0.32" "pillow>=11.0.0"

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test

RUN pip install --no-cache-dir ".[test]"
COPY tests/ ./tests/

CMD ["python", "-m", "pytest"]
