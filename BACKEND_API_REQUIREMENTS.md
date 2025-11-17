# Backend API Requirements for Tivly

This document outlines the backend API endpoints needed to fully support the Tivly frontend application.

## Authentication
All endpoints require a valid JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```

The backend should validate the token and extract the `userId` from it.

---

## 1. Action Items Management

### POST `/meetings/:meetingId/action-items`
Save action items generated from a meeting protocol.

**Request Body:**
```json
{
  "actionItems": [
    {
      "title": "string (required)",
      "description": "string | null",
      "owner": "string | null",
      "deadline": "string (ISO date) | null",
      "priority": "critical" | "high" | "medium" | "low"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "actionItems": [
    {
      "id": "uuid",
      "meetingId": "uuid",
      "userId": "string",
      "title": "string",
      "description": "string | null",
      "owner": "string | null",
      "deadline": "string | null",
      "priority": "string",
      "status": "pending",
      "createdAt": "ISO date string",
      "updatedAt": "ISO date string"
    }
  ]
}
```

**Implementation Notes:**
- Extract `userId` from JWT token (not from request body)
- Set default `status` to "pending"
- Validate that the `meetingId` exists and belongs to the authenticated user
- Store action items in your database with proper user association
- Each action item should be linked to both the meeting and the user

---

## 2. Agenda Management

### GET `/agendas/:agendaId`
Fetch a meeting agenda by ID.

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "string",
  "content": "string (markdown or plain text)",
  "userId": "string",
  "createdAt": "ISO date string",
  "updatedAt": "ISO date string"
}
```

**Implementation Notes:**
- Validate that the agenda belongs to the authenticated user
- Return 404 if agenda doesn't exist or user doesn't have access
- The `content` field should contain the full agenda text

---

## 3. Protocol Attachment (Already Implemented)

### POST `/meetings/:meetingId/protocol`
Save a generated protocol document to a meeting.

**Request Body:**
```json
{
  "fileName": "string (e.g., 'Meeting Protocol.docx')",
  "mimeType": "string (e.g., 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')",
  "documentBlob": "string (base64 encoded document)"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "protocol": {
    "id": "uuid",
    "meetingId": "uuid",
    "fileName": "string",
    "mimeType": "string",
    "size": "number (bytes)",
    "createdAt": "ISO date string"
  }
}
```

### GET `/meetings/:meetingId/protocol`
Retrieve the protocol document for a meeting.

**Response (200 OK):**
```json
{
  "id": "uuid",
  "meetingId": "uuid",
  "fileName": "string",
  "mimeType": "string",
  "documentBlob": "string (base64)",
  "size": "number",
  "createdAt": "ISO date string"
}
```

**Response (404 Not Found):**
```json
{
  "error": "Protocol not found"
}
```

---

## Database Schema Recommendations

### action_items table
```sql
CREATE TABLE action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner VARCHAR(255),
  deadline TIMESTAMP,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Foreign keys
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
  
  -- Indexes
  INDEX idx_action_items_meeting (meeting_id),
  INDEX idx_action_items_user (user_id),
  INDEX idx_action_items_status (status)
);
```

### meeting_agendas table
```sql
CREATE TABLE meeting_agendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_agendas_user (user_id)
);
```

---

## Security Requirements

1. **Authentication**: All endpoints must validate JWT tokens
2. **Authorization**: Users can only access their own data
3. **Input Validation**: 
   - Validate all UUIDs are properly formatted
   - Sanitize text inputs to prevent XSS
   - Validate priority/status enum values
4. **Rate Limiting**: Implement rate limiting on all endpoints
5. **CORS**: Ensure proper CORS headers for the Tivly domain

---

## Error Responses

All error responses should follow this format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {} // Optional additional context
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (user doesn't have access)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate resource)
- `500` - Internal Server Error

---

## Migration Notes

The frontend has been updated to:
1. ✅ Remove direct Supabase calls for action items
2. ✅ Remove direct Supabase calls for agendas
3. ✅ Use backend API for protocol attachment (already implemented)

Next steps for backend:
1. Implement `POST /meetings/:meetingId/action-items`
2. Implement `GET /agendas/:agendaId`
3. Ensure proper JWT authentication and user authorization
4. Test all endpoints with the Tivly frontend
