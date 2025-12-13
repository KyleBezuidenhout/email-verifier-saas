import re

def clean_first_name(first_name: str) -> str:
    """
    Clean first name by removing trailing initials (e.g., "n.", "m.").
    """
    if not first_name:
        return first_name
    
    # Strip whitespace
    cleaned = first_name.strip()
    
    # Remove trailing pattern: space + single letter + optional period
    # Pattern matches: " n.", " n", " m.", " m", etc.
    cleaned = re.sub(r'\s+[a-zA-Z]\.?\s*$', '', cleaned)
    
    return cleaned.strip()

# Test cases
test_cases = ['Chelsey n.', 'John m.', 'Sarah j.', 'Mary-Anne', 'Bob A.', 'Test  x', 'Normal Name', '']
print("Testing clean_first_name function:")
print("-" * 40)
for test in test_cases:
    result = clean_first_name(test)
    print(f'{test:20} -> "{result}"')
