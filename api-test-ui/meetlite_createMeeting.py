import json
import uuid
from datetime import datetime, timedelta, timezone
import boto3


dynamodb = boto3.resource("dynamodb")
meetings_table = dynamodb.Table("Meetings")


def _json_response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def _parse_body(event):
    raw_body = event.get("body")

    if raw_body is None:
        return None, "Request body is required"

    if isinstance(raw_body, str):
        raw_body = raw_body.strip()
        if not raw_body:
            return None, "Request body is required"
        try:
            parsed = json.loads(raw_body)
        except json.JSONDecodeError:
            return None, "Request body must be valid JSON"
    elif isinstance(raw_body, dict):
        parsed = raw_body
    else:
        return None, "Request body must be valid JSON"

    # Supports both direct payload and wrapped payload: {"body": "{...}"}
    if isinstance(parsed, dict) and "body" in parsed and isinstance(parsed["body"], str):
        try:
            parsed = json.loads(parsed["body"])
        except json.JSONDecodeError:
            return None, "Wrapped body must be valid JSON"

    if not isinstance(parsed, dict):
        return None, "Request body must be a JSON object"

    return parsed, None


def lambda_handler(event, context):
    body, error = _parse_body(event or {})
    if error:
        return _json_response(400, {"error": error})

    user_id = (body.get("userId") or "").strip()
    if not user_id:
        return _json_response(400, {"error": "userId is required"})

    meeting_id = str(uuid.uuid4()).replace("-", "")[:6].upper()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=1)

    meetings_table.put_item(
        Item={
            "meetingId": meeting_id,
            "hostUserId": user_id,
            "createdAt": now.isoformat(),
            "expiresAt": expires_at.isoformat(),
            "status": "ACTIVE",
        }
    )

    return _json_response(
        200,
        {
            "meetingId": meeting_id,
            "expiresAt": expires_at.isoformat(),
        },
    )
