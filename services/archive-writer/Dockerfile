FROM python:3.12-slim
WORKDIR /app
COPY services/archive-writer/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 writer
COPY services/archive-writer/app.py ./app.py
ENV PYTHONUNBUFFERED=1 PORT=8080 ICEBERG_WRITER_ENABLED=false PYICEBERG_MAX_WORKERS=2
USER writer
EXPOSE 8080
CMD ["python", "app.py"]
