# Domain Migration Checklist

Use this checklist when migrating to a new domain to ensure nothing is missed.

## Frontend Code Files (Already Updated ✅)

### 1. API Client Configuration
- [x] **`frontend/lib/api.ts`** - Line 3
  - Default: `https://api.billionverifier.io`
  - Status: ✅ Updated

- [x] **`frontend/lib/sse.ts`** - Line 12
  - Default: `https://api.billionverifier.io`
  - Status: ✅ Updated

- [x] **`frontend/app/(dashboard)/api-docs/page.tsx`** - Line 19
  - Default: `https://api.billionverifier.io`
  - Status: ✅ Updated

## Vercel Environment Variables (REQUIRED - Check This!)

### 2. Frontend Environment Variables
- [ ] **Vercel Dashboard → Your Project → Settings → Environment Variables**
  - Variable: `NEXT_PUBLIC_API_URL`
  - Value: `https://api.billionverifier.io` (or your new backend domain)
  - **IMPORTANT**: Must be set for Production, Preview, and Development environments
  - **Action**: Add/Update this variable in Vercel

## Backend Configuration (Railway)

### 3. Backend CORS Configuration (Optional - Currently allows all)
- [ ] **`backend/app/main.py`** - Lines 19-23
  - Currently set to `allow_origins=["*"]` (allows all)
  - **Optional**: If you want to restrict, add your frontend domain:
    ```python
    origins = [
        "http://localhost:3000",
        "https://www.billionverifier.io",  # Add your frontend domain
        "https://billionverifier.io",      # Add if using non-www
    ]
    ```
  - **Note**: Currently allows all origins, so this is optional

### 4. Railway Domain Configuration
- [ ] **Railway Dashboard → Your Backend Service → Settings → Domains**
  - Add custom domain: `api.billionverifier.io`
  - Railway will provide DNS records (CNAME)
  - **Status**: Verify this is configured

## DNS Configuration (Spaceship.com or Your DNS Provider)

### 5. DNS Records
- [ ] **CNAME Record for Backend API**
  - Type: CNAME
  - Name: `api` (or `api.billionverifier.io`)
  - Value: Railway's provided CNAME target (e.g., `xxxxx.up.railway.app`)
  - TTL: Auto or 3600

- [ ] **CNAME Record for Frontend** (if using subdomain)
  - Type: CNAME
  - Name: `www` (or `app` or root)
  - Value: Vercel's provided CNAME target
  - TTL: Auto or 3600

- [ ] **A Record for Root Domain** (if needed)
  - Type: A
  - Name: `@` (or root)
  - Value: Vercel's IP addresses (if not using CNAME)

## Testing Checklist

### 6. Backend Accessibility Tests
- [ ] **Health Check**: Visit `https://api.billionverifier.io/health`
  - Should return: `{"status": "healthy"}`
  - If fails: Backend not accessible or DNS not propagated

- [ ] **API Docs**: Visit `https://api.billionverifier.io/api/docs`
  - Should show FastAPI documentation page
  - If fails: Backend not accessible

- [ ] **CORS Test**: Open browser console on your frontend
  - Make an API call and check for CORS errors
  - Should not see CORS errors

### 7. Frontend Functionality Tests
- [ ] **Login/Register**: Test authentication
- [ ] **Upload CSV**: Test file upload
- [ ] **Job Processing**: Test job creation and processing
- [ ] **Verify Catchalls**: Test catchall verification button
- [ ] **Download CSV**: Test results download
- [ ] **Real-time Updates**: Test SSE connections (job progress)

## Deployment Checklist

### 8. Vercel Deployment
- [ ] **Environment Variable Set**: `NEXT_PUBLIC_API_URL` is set
- [ ] **Redeploy**: Trigger a new deployment after setting env var
- [ ] **Verify Build**: Check that build completes successfully
- [ ] **Check Logs**: Review Vercel deployment logs for errors

### 9. Railway Deployment
- [ ] **Service Running**: Backend service is active
- [ ] **Domain Connected**: Custom domain shows as "Active" in Railway
- [ ] **SSL Certificate**: Railway automatically provisions SSL (check status)
- [ ] **Check Logs**: Review Railway logs for any errors

## Common Issues & Solutions

### Issue: "Unable to connect to backend"
**Possible Causes:**
1. DNS not propagated yet (wait 5-60 minutes)
2. Vercel env var not set or not redeployed
3. Railway domain not configured
4. Backend service not running
5. SSL certificate not ready

**Solutions:**
- Check DNS propagation: Use `dig api.billionverifier.io` or online DNS checker
- Verify Vercel env var is set and deployment is complete
- Check Railway service status and domain configuration
- Test backend directly: `curl https://api.billionverifier.io/health`

### Issue: CORS Errors
**Solution:**
- Backend already allows all origins (`allow_origins=["*"]`)
- If still seeing errors, check Railway logs for CORS middleware issues

### Issue: SSL Certificate Errors
**Solution:**
- Railway automatically provisions SSL certificates
- Wait 5-10 minutes after adding domain
- Check Railway domain status page

## Quick Verification Commands

```bash
# Test backend health
curl https://api.billionverifier.io/health

# Test DNS resolution
nslookup api.billionverifier.io

# Check SSL certificate
openssl s_client -connect api.billionverifier.io:443 -servername api.billionverifier.io
```

## Summary

**Critical Items (Must Do):**
1. ✅ Frontend code files (already updated)
2. ⚠️ **Vercel Environment Variable** - `NEXT_PUBLIC_API_URL` (MOST IMPORTANT!)
3. ⚠️ **Railway Domain Configuration** - Add `api.billionverifier.io`
4. ⚠️ **DNS Records** - Add CNAME for `api` subdomain
5. ⚠️ **Redeploy Frontend** - After setting env var

**Optional Items:**
- Backend CORS origins list (currently allows all, so optional)
- Restrictive CORS policy (if you want to limit origins)

