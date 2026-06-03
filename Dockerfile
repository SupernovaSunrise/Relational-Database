FROM python:3.12-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY web_app.py .
COPY templates/ ./templates/

# Expose Flask port
EXPOSE 5000

# Run the Flask application
CMD ["python", "web_app.py"]
