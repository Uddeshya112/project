import asyncio
import logging

logger = logging.getLogger("intellischedule.worker")


async def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger.info("IntelliSchedule worker started; event processing is introduced in Phase 3")
    while True:
        await asyncio.sleep(30)
        logger.info("worker heartbeat; outbox processor is not enabled until Phase 3")


if __name__ == "__main__":
    asyncio.run(run())
