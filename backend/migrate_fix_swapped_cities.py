"""
Migration: Fix swapped state/city columns in google_maps_cities table

Some data was inserted with columns swapped (city names in 'state' column, state names in 'city' column).
This script identifies those rows and swaps them back to correct order.

Detection logic: If the 'state' column value is NOT a valid US state name, it's swapped.
"""

import logging
from sqlalchemy import text
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

# All valid US state names
US_STATES = {
    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
    "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "District of Columbia"
}


def run_migration():
    """Fix swapped state/city columns"""
    db = SessionLocal()
    try:
        logger.info("Starting migration to fix swapped state/city columns...")
        
        # First, let's see what we have
        result = db.execute(text("""
            SELECT DISTINCT state FROM google_maps_cities ORDER BY state
        """))
        all_state_values = [row[0] for row in result.fetchall()]
        
        # Find values in state column that are NOT valid US states (these are city names)
        swapped_values = [v for v in all_state_values if v not in US_STATES]
        correct_values = [v for v in all_state_values if v in US_STATES]
        
        logger.info(f"Found {len(correct_values)} correctly placed states: {correct_values[:5]}...")
        logger.info(f"Found {len(swapped_values)} swapped values (cities in state column): {swapped_values[:10]}...")
        
        if not swapped_values:
            logger.info("No swapped data found. Migration complete.")
            return
        
        # Count affected rows
        count_result = db.execute(text("""
            SELECT COUNT(*) FROM google_maps_cities WHERE state NOT IN :states
        """), {"states": tuple(US_STATES)})
        affected_rows = count_result.scalar()
        logger.info(f"Total rows to fix: {affected_rows}")
        
        # Swap the columns for affected rows
        # We use a temporary value to avoid unique constraint violations
        logger.info("Swapping columns for affected rows...")
        
        db.execute(text("""
            UPDATE google_maps_cities
            SET state = city, city = state
            WHERE state NOT IN :states
        """), {"states": tuple(US_STATES)})
        
        db.commit()
        
        # Verify the fix
        result = db.execute(text("""
            SELECT DISTINCT state FROM google_maps_cities ORDER BY state
        """))
        final_states = [row[0] for row in result.fetchall()]
        valid_states = [s for s in final_states if s in US_STATES]
        invalid_states = [s for s in final_states if s not in US_STATES]
        
        logger.info(f"After migration:")
        logger.info(f"  Valid states: {len(valid_states)} - {valid_states[:10]}...")
        if invalid_states:
            logger.warning(f"  Still invalid: {len(invalid_states)} - {invalid_states[:10]}...")
        else:
            logger.info("  All state values are now valid US state names!")
        
        logger.info("✅ Migration completed successfully!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error during migration: {str(e)}")
        raise
    finally:
        db.close()


def dry_run():
    """Preview what would be changed without making changes"""
    db = SessionLocal()
    try:
        logger.info("DRY RUN - Previewing changes...")
        
        # Get all distinct values in state column
        result = db.execute(text("""
            SELECT DISTINCT state FROM google_maps_cities ORDER BY state
        """))
        all_state_values = [row[0] for row in result.fetchall()]
        
        # Categorize
        swapped_values = [v for v in all_state_values if v not in US_STATES]
        correct_values = [v for v in all_state_values if v in US_STATES]
        
        print("\n" + "="*60)
        print("CORRECTLY PLACED (state column has state names):")
        print("="*60)
        for v in correct_values:
            count = db.execute(text(
                "SELECT COUNT(*) FROM google_maps_cities WHERE state = :state"
            ), {"state": v}).scalar()
            print(f"  {v}: {count} cities")
        
        print("\n" + "="*60)
        print("SWAPPED (state column has city names - NEEDS FIX):")
        print("="*60)
        for v in swapped_values[:20]:  # Show first 20
            count = db.execute(text(
                "SELECT COUNT(*) FROM google_maps_cities WHERE state = :state"
            ), {"state": v}).scalar()
            # Check what's in the city column for these
            city_val = db.execute(text(
                "SELECT DISTINCT city FROM google_maps_cities WHERE state = :state LIMIT 1"
            ), {"state": v}).scalar()
            print(f"  state='{v}' (city='{city_val}'): {count} rows")
        
        if len(swapped_values) > 20:
            print(f"  ... and {len(swapped_values) - 20} more")
        
        # Total counts
        swapped_count = db.execute(text("""
            SELECT COUNT(*) FROM google_maps_cities WHERE state NOT IN :states
        """), {"states": tuple(US_STATES)}).scalar()
        
        correct_count = db.execute(text("""
            SELECT COUNT(*) FROM google_maps_cities WHERE state IN :states
        """), {"states": tuple(US_STATES)}).scalar()
        
        print("\n" + "="*60)
        print("SUMMARY:")
        print("="*60)
        print(f"  Correctly placed rows: {correct_count}")
        print(f"  Swapped rows (need fix): {swapped_count}")
        print(f"  Total rows: {correct_count + swapped_count}")
        
    finally:
        db.close()


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    
    if len(sys.argv) > 1 and sys.argv[1] == "--dry-run":
        dry_run()
    else:
        print("Running migration...")
        print("Use --dry-run to preview changes first")
        run_migration()
