FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY mltraining/scoring/requirements.txt ./requirements.txt
COPY mltraining/scoring/constraints-py314.txt ./constraints-py314.txt
RUN pip install --no-cache-dir -c constraints-py314.txt -r requirements.txt
COPY mltraining/scoring ./
EXPOSE 8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
