"""
Apify Google Maps Scraper Service

This service communicates with the Apify API to run the compass/crawler-google-places actor.
Handles single city and state-wide (concurrent) scraping with webhook callbacks.
"""

import json
import base64
import httpx
import logging
import secrets
from typing import Optional, Dict, Any, List
from app.core.config import settings

logger = logging.getLogger(__name__)


class ApifyGoogleMapsService:
    """Service for Google Maps scraping via Apify compass/crawler-google-places actor"""
    
    BASE_URL = "https://api.apify.com/v2"
    ACTOR_ID = "compass~crawler-google-places"
    MAX_CONCURRENT_RUNS = 20  # 20 concurrent x 4GB = 80GB (within 128GB limit)
    
    def __init__(self):
        self.api_token = settings.APIFY_API_TOKEN
        self.webhook_secret = settings.APIFY_WEBHOOK_SECRET
        self.timeout = 30.0
    
    @property
    def _headers(self) -> Dict[str, str]:
        """Get authorization headers"""
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
    
    def build_input_payload(
        self,
        search_term: str,
        city: str
    ) -> Dict[str, Any]:
        """
        Build the input payload for a single city scrape.
        
        Optimized for:
        - Maximum TAM (Total Addressable Market) - NO results cap
        - Lowest cost (only fetch websites, no reviews/images/questions)
        - Businesses with websites only
        
        Uses locationQuery format: "City, United States" (per Apify recommendation)
        """
        # Format location for Apify: "Los Angeles, United States"
        location_query = f"{city}, United States"
        
        return {
            "searchStringsArray": [search_term],
            "locationQuery": location_query,
            "language": "en",
            # No maxCrawledPlacesPerSearch - scrape ALL results
            "maxReviews": 0,  # Cost optimization
            "maxImages": 0,  # Cost optimization
            "maxQuestions": 0,  # Cost optimization
            "skipClosedPlaces": True,  # Exclude closed businesses
            "website": "withWebsite",  # Only businesses with websites
            "scrapeContacts": False,  # Saves $0.002/place - website URL is in base data
            "scrapeDirectories": False,
            "includeWebResults": False
        }
    
    async def start_run(
        self,
        input_payload: Dict[str, Any],
        webhook_url: Optional[str] = None,
        memory_mbytes: int = 4096
    ) -> Dict[str, Any]:
        """
        Start an async Apify actor run.
        
        Args:
            input_payload: The input configuration for the scraper
            webhook_url: URL to call when run completes (optional)
            memory_mbytes: Memory allocation (default 4GB)
            
        Returns:
            Run information including run ID
        """
        try:
            url = f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs"
            params = {"memory": memory_mbytes}
            
            # Add webhook if provided (must be base64-encoded JSON array)
            # Per Apify docs: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
            if webhook_url:
                webhooks = [{
                    "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
                    "requestUrl": webhook_url
                }]
                webhooks_json = json.dumps(webhooks)
                params["webhooks"] = base64.b64encode(webhooks_json.encode('utf-8')).decode('utf-8')
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    headers=self._headers,
                    params=params,
                    json=input_payload
                )
                response.raise_for_status()
                result = response.json()
                
                run_id = result.get("data", {}).get("id")
                logger.info(f"✅ Started Apify run: {run_id}")
                return result.get("data", {})
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error starting Apify run: {e.response.status_code} - {e.response.text}")
            raise Exception(f"Failed to start Apify run: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error starting Apify run: {str(e)}")
            raise Exception(f"Could not connect to Apify API: {str(e)}")
    
    async def start_run_with_webhook(
        self,
        input_payload: Dict[str, Any],
        webhook_url: str,
        order_id: str,
        city_index: int,
        memory_mbytes: int = 4096,
        webhook_secret: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Start an Apify run with webhook configuration.
        
        The webhook will be called when the run finishes (SUCCEEDED, FAILED, ABORTED, TIMED-OUT).
        """
        try:
            # Use provided webhook_secret or fall back to default
            secret = webhook_secret or self.webhook_secret
            
            # Construct webhook configuration
            # Note: shouldInterpolateStrings is needed for {{eventType}} inside quotes to be replaced
            webhooks = [{
                "eventTypes": ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED", "ACTOR.RUN.TIMED_OUT"],
                "requestUrl": webhook_url,
                "payloadTemplate": f'{{"orderId": "{order_id}", "cityIndex": {city_index}, "secret": "{secret}", "resource": {{{{resource}}}}, "eventType": "{{{{eventType}}}}"}}',
                "shouldInterpolateStrings": True
            }]
            
            url = f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs"
            # Webhooks must be passed as a query parameter (base64-encoded JSON), not in the body
            # Per Apify docs: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
            webhooks_json = json.dumps(webhooks)
            webhooks_base64 = base64.b64encode(webhooks_json.encode('utf-8')).decode('utf-8')
            params = {
                "memory": memory_mbytes,
                "webhooks": webhooks_base64
            }
            
            # Body contains only the actor input
            body = input_payload
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    url,
                    headers=self._headers,
                    params=params,
                    json=body
                )
                response.raise_for_status()
                result = response.json()
                
                run_data = result.get("data", {})
                run_id = run_data.get("id")
                logger.info(f"✅ Started Apify run {run_id} for order {order_id}, city index {city_index}")
                return run_data
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error starting Apify run: {e.response.status_code} - {e.response.text}")
            raise Exception(f"Failed to start Apify run: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error starting Apify run: {str(e)}")
            raise Exception(f"Could not connect to Apify API: {str(e)}")
    
    async def get_run_status(self, run_id: str) -> Dict[str, Any]:
        """
        Get the status of an Apify run.
        
        Args:
            run_id: The Apify run ID
            
        Returns:
            Run status information
        """
        try:
            url = f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs/{run_id}"
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, headers=self._headers)
                response.raise_for_status()
                return response.json().get("data", {})
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting run status: {e.response.status_code}")
            raise Exception(f"Failed to get run status: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting run status: {str(e)}")
            raise Exception(f"Could not connect to Apify API")
    
    async def get_dataset_items(
        self,
        dataset_id: str,
        offset: int = 0,
        limit: int = 10000,
        fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get items from an Apify dataset.
        
        Args:
            dataset_id: The dataset ID (from run's defaultDatasetId)
            offset: Starting offset
            limit: Maximum items to return
            fields: Optional list of fields to return
            
        Returns:
            List of scraped place items
        """
        try:
            url = f"{self.BASE_URL}/datasets/{dataset_id}/items"
            params = {
                "offset": offset,
                "limit": limit,
                "format": "json"
            }
            
            if fields:
                params["fields"] = ",".join(fields)
            
            async with httpx.AsyncClient(timeout=60.0) as client:  # Longer timeout for large datasets
                response = await client.get(url, headers=self._headers, params=params)
                response.raise_for_status()
                return response.json()
                
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error getting dataset items: {e.response.status_code}")
            raise Exception(f"Failed to get dataset items: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting dataset items: {str(e)}")
            raise Exception(f"Could not connect to Apify API")
    
    async def abort_run(self, run_id: str) -> Dict[str, Any]:
        """Abort a running Apify run (async version)."""
        try:
            url = f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs/{run_id}/abort"
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, headers=self._headers)
                response.raise_for_status()
                logger.info(f"Aborted Apify run: {run_id}")
                return response.json().get("data", {})
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error aborting run: {e.response.status_code}")
            raise Exception(f"Failed to abort run: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error aborting run: {str(e)}")
            raise Exception(f"Could not connect to Apify API")

    def abort_run_sync(self, run_id: str) -> Dict[str, Any]:
        """Abort a running Apify run (sync version for use in def endpoints)."""
        try:
            url = f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs/{run_id}/abort"
            response = httpx.post(url, headers=self._headers, timeout=self.timeout)
            response.raise_for_status()
            logger.info(f"Aborted Apify run: {run_id}")
            return response.json().get("data", {})
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error aborting run: {e.response.status_code}")
            raise Exception(f"Failed to abort run: {e.response.text}")
        except httpx.RequestError as e:
            logger.error(f"Request error aborting run: {str(e)}")
            raise Exception(f"Could not connect to Apify API")
    
    async def check_health(self) -> bool:
        """
        Check if Apify API is accessible and token is valid.
        
        Returns:
            True if API is accessible, False otherwise
        """
        if not self.api_token:
            logger.warning("APIFY_API_TOKEN not configured")
            return False
            
        try:
            # Check user info endpoint to validate token
            url = f"{self.BASE_URL}/users/me"
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url, headers=self._headers)
                
                if response.status_code == 200:
                    user_data = response.json().get("data", {})
                    username = user_data.get("username", "unknown")
                    logger.info(f"✅ Apify API connected (user: {username})")
                    return True
                elif response.status_code == 401:
                    logger.error("❌ Invalid Apify API token")
                    return False
                else:
                    logger.warning(f"⚠️ Apify API returned status {response.status_code}")
                    return False
                    
        except Exception as e:
            logger.error(f"❌ Could not connect to Apify API: {str(e)}")
            return False
    
    def generate_webhook_secret(self) -> str:
        """Generate a random webhook secret for order verification"""
        return secrets.token_urlsafe(32)
    
    def estimate_cost(self, num_cities: int, results_per_city: int = 200) -> float:
        """
        Estimate the cost of a scrape job.
        
        Based on Apify pricing:
        - compass/crawler-google-places: ~$0.004 per result
        - With our settings (no reviews/images): ~$0.004 per result
        - Per city (200 results max): ~$0.80
        
        Args:
            num_cities: Number of cities to scrape
            results_per_city: Expected results per city (default 200)
            
        Returns:
            Estimated cost in USD
        """
        cost_per_result = 0.004  # $0.004 per result
        return num_cities * results_per_city * cost_per_result
    
    @staticmethod
    def extract_output_fields(place: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract the fields we need from an Apify place result.
        
        Args:
            place: Raw place data from Apify
            
        Returns:
            Cleaned place data with only the fields we need
        """
        location = place.get("location", {}) or {}
        
        return {
            "placeId": place.get("placeId", ""),  # Unique key for deduplication
            "title": place.get("title", ""),  # Business name
            "website": place.get("website", ""),  # THE MAIN THING WE WANT
            "phone": place.get("phone", ""),
            "address": place.get("address", ""),
            "city": place.get("city", ""),
            "state": place.get("state", ""),
            "postalCode": place.get("postalCode", ""),
            "totalScore": place.get("totalScore"),  # Rating
            "reviewsCount": place.get("reviewsCount", 0),
            "categoryName": place.get("categoryName", ""),
            "latitude": location.get("lat"),
            "longitude": location.get("lng"),
        }


# Singleton instance
apify_service = ApifyGoogleMapsService()
