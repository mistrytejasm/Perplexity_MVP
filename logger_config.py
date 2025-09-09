import logging
import os

def setup_logger():
    # Make sure logs/ folder exists
    os.makedirs("logs", exist_ok=True)

    logging.basicConfig(
        level=logging.DEBUG,  # capture everything from DEBUG upwards
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(),  # print to console
            logging.FileHandler("logs/app.log", encoding="utf-8")  # save to logs/app.log
        ]
    )
