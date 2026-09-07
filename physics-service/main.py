import uvicorn
from fastapi import FastAPI
from api.routes import health
from api.routes import predict
from api.routes import ml
from api.routes import health_analysis
from api.routes import degradation

app = FastAPI(title="AeroTwin-X Physics Service", version="0.1.0")

app.include_router(health.router)
app.include_router(predict.router)
app.include_router(ml.router)
app.include_router(health_analysis.router)
app.include_router(degradation.router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
