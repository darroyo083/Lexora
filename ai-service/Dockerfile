FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir paddlepaddle==3.2.2

COPY pyproject.toml .
RUN pip install --no-cache-dir "fastapi==0.140.13" "pydantic==2.13.4" "uvicorn==0.52.0" "paddleocr==3.7.0" "python-multipart==0.0.32" "pillow>=11.0.0"

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
