from typing import List, Dict

from collections import defaultdict


def deduplicate_leads(leads: List[Dict]) -> List[Dict]:
    """
    Deduplicate leads to return only the best email per unique person.

    

    Priority:
    1. Valid emails (highest prevalence score)
    2. Catchall emails (highest prevalence score)
    3. Not found (single entry)
    """
    unique_leads = defaultdict(list)

    

    for lead in leads:
        key = (
            lead["first_name"].lower(),
            lead["last_name"].lower(),
            lead["domain"].lower()
        )
        unique_leads[key].append(lead)

    

    final_results = []

    

    for key, lead_group in unique_leads.items():
        valid = [l for l in lead_group if l["verification_status"] == "valid"]
        catchall = [l for l in lead_group if l["verification_status"] == "catchall"]

        

        if valid:
            best = max(valid, key=lambda x: x["prevalence_score"])
            final_results.append(best)
        elif catchall:
            best = max(catchall, key=lambda x: x["prevalence_score"])
            final_results.append(best)
        else:
            final_results.append({
                "first_name": lead_group[0]["first_name"],
                "last_name": lead_group[0]["last_name"],
                "domain": lead_group[0]["domain"],
                "email": "",
                "verification_status": "not_found",
                "prevalence_score": 0,
            })

    

    return final_results



