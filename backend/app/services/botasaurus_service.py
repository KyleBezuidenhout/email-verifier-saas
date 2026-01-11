"""
Google Maps Scraper API Service

This service communicates with the Google Maps Scraper API running on AWS.
"""

import httpx
import logging
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)


class BotasaurusService:
    """Service for communicating with Google Maps Scraper API on AWS"""
    
    def __init__(self, base_url: str = None):
        # Default to AWS instance, can be configured via environment
        self.base_url = base_url or getattr(settings, 'BOTASAURUS_API_URL', 'http://16.16.4.71:8000')
        self.timeout = 120.0  # Longer timeout for scraping operations
    
    async def create_async_task(self, scraper_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create an asynchronous scraping task.
        
        Args:
            scraper_name: Name of the scraper (e.g., 'google_maps_scraper')
            data: Scraper configuration data
            
        Returns:
            Task information including task ID
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/createAsyncTask",
                    json={
                        "scraperName": scraper_name,
                        "data": data
                    }
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Created async task: {result}")
                return result
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error creating task: {e.response.status_code} - {e.response.text}")
            raise Exception(f"Failed to create scraping task: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error creating task: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API at {self.base_url}. Is it running?")
    
    async def create_sync_task(self, scraper_name: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a synchronous scraping task (waits for completion).
        Use with caution - can take a long time.
        
        Args:
            scraper_name: Name of the scraper
            data: Scraper configuration data
            
        Returns:
            Task information with results
        """
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:  # 10 min timeout for sync
                response = await client.post(
                    f"{self.base_url}/api/createSyncTask",
                    json={
                        "scraperName": scraper_name,
                        "data": data
                    }
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error creating sync task: {e.response.status_code}")
            raise Exception(f"Failed to create scraping task: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error creating sync task: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API at {self.base_url}")
    
    async def get_task(self, task_id: int) -> Dict[str, Any]:
        """
        Get task status and details.
        
        Args:
            task_id: The task ID
            
        Returns:
            Task information including status
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(f"{self.base_url}/api/tasks/{task_id}")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting task {task_id}: {e.response.status_code}")
            raise Exception(f"Failed to get task status: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting task: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def get_tasks(self, page: int = 1, per_page: int = 100) -> Dict[str, Any]:
        """
        Get all tasks with pagination.
        
        Args:
            page: Page number (1-indexed)
            per_page: Results per page
            
        Returns:
            List of tasks
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/api/tasks",
                    params={"page": page, "perPage": per_page}
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting tasks: {e.response.status_code}")
            raise Exception(f"Failed to get tasks: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting tasks: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def get_task_results(
        self, 
        task_id: int, 
        page: int = 1, 
        per_page: int = 100,
        view: Optional[str] = None,
        sort: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Get task results with optional pagination, view, sort, and filters.
        
        Args:
            task_id: The task ID
            page: Page number
            per_page: Results per page
            view: Optional view (overview, featured_reviews, detailed_reviews)
            sort: Optional sort order
            filters: Optional filters
            
        Returns:
            Task results
        """
        try:
            params = {"page": page, "perPage": per_page}
            if view:
                params["view"] = view
            if sort:
                params["sort"] = sort
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                if filters:
                    response = await client.post(
                        f"{self.base_url}/api/tasks/{task_id}/results",
                        params=params,
                        json={"filters": filters}
                    )
                else:
                    response = await client.get(
                        f"{self.base_url}/api/tasks/{task_id}/results",
                        params=params
                    )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting task results: {e.response.status_code}")
            raise Exception(f"Failed to get task results: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting task results: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def download_task_results(
        self, 
        task_id: int, 
        format: str = "csv"
    ) -> tuple[bytes, str]:
        """
        Download task results in specified format.
        
        Args:
            task_id: The task ID
            format: Output format (csv, json, excel)
            
        Returns:
            Tuple of (file bytes, filename)
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(
                    f"{self.base_url}/api/tasks/{task_id}/download",
                    params={"format": format}
                )
                response.raise_for_status()
                
                # Get filename from Content-Disposition header
                content_disposition = response.headers.get("Content-Disposition", "")
                filename = f"results_{task_id}.{format}"
                if "filename=" in content_disposition:
                    filename = content_disposition.split("filename=")[1].strip('"')
                
                return response.content, filename
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error downloading task results: {e.response.status_code}")
            raise Exception(f"Failed to download task results: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error downloading task results: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def abort_task(self, task_id: int) -> Dict[str, Any]:
        """
        Abort a running task.
        
        Args:
            task_id: The task ID
            
        Returns:
            Confirmation response
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/api/tasks/{task_id}/abort")
                response.raise_for_status()
                return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error aborting task: {e.response.status_code}")
            raise Exception(f"Failed to abort task: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error aborting task: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def delete_task(self, task_id: int) -> Dict[str, Any]:
        """
        Delete a task.
        
        Args:
            task_id: The task ID
            
        Returns:
            Confirmation response
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.delete(f"{self.base_url}/api/tasks/{task_id}")
                response.raise_for_status()
                return {"success": True, "message": f"Task {task_id} deleted"}
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error deleting task: {e.response.status_code}")
            raise Exception(f"Failed to delete task: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error deleting task: {str(e)}")
            raise Exception(f"Could not connect to Google Maps Scraper API")
    
    async def check_health(self) -> bool:
        """
        Check if Google Maps Scraper API is reachable.
        
        Returns:
            True if API is reachable, False otherwise
        """
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tasks")
                is_healthy = response.status_code == 200
                if is_healthy:
                    logger.info(f"✅ Google Maps Scraper API health check: CONNECTED to {self.base_url}")
                else:
                    logger.warning(f"⚠️ Google Maps Scraper API returned status {response.status_code}")
                return is_healthy
        except Exception as e:
            logger.error(f"❌ Google Maps Scraper API health check FAILED: {str(e)}")
            return False
    
    def build_google_maps_config(
        self,
        business_types: List[str],
        search_method: str = "city",
        cities: List[str] = None,
        search_links: List[str] = None,
        extraction_method: str = "detailed",
        max_results: Optional[int] = None,
        enable_reviews: bool = False,
        max_reviews: int = 20,
        enable_photos: bool = False,
        max_photos: int = 100,
        lang: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Build configuration object for Google Maps scraper.
        
        Returns:
            Configuration dict ready for the API
        """
        config = {
            "business_types": business_types,
            "search_method": search_method,
            "countries": [],
            "states": [],
            "cities": cities or [],
            "randomize_cities": kwargs.get("randomize_cities", True),
            "include_places_outside_city": kwargs.get("include_places_outside_city", True),
            "search_links": search_links or [],
            "extraction_method": extraction_method,
            "geo_shape": kwargs.get("geo_shape", "polygons"),
            "point_coordinates": kwargs.get("point_coordinates", ""),
            "polygons": kwargs.get("polygons", None),
            "geo_zoom_level": kwargs.get("geo_zoom_level", "16"),
            "exclude_outside_shape": kwargs.get("exclude_outside_shape", True),
            "api_key": kwargs.get("api_key", ""),
            "enable_reviews_extraction": enable_reviews,
            "max_reviews": max_reviews,
            "reviews_sort": kwargs.get("reviews_sort", "newest"),
            "reviews_query": kwargs.get("reviews_query", ""),
            "enable_photos_extraction": enable_photos,
            "max_photos": max_photos,
            "lang": lang,
            "max_results": max_results,
        }
        return config


# Singleton instance
botasaurus_service = BotasaurusService()

