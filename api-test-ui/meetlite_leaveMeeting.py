import json
from datetime import datetime, timezone
import boto3


dynamodb = boto3.resource("dynamodb")
meetings_table = dynamodb.Table("Meetings")
participants_table = dynamodb.Table("Participants")


def _json_response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def _parse_body(event):
    raw_body = (event or {}).get("body")

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

    meeting_id = (body.get("meetingId") or "").strip()
    user_email = (body.get("userEmail") or "").strip()

    if not meeting_id or not user_email:
        return _json_response(400, {"error": "meetingId and userEmail are required"})

    meeting = meetings_table.get_item(Key={"meetingId": meeting_id}).get("Item")
    if not meeting:
        return _json_response(404, {"error": "Meeting not found"})

    participant = participants_table.get_item(
        Key={"meetingId": meeting_id, "userEmail": user_email}
    ).get("Item")

    if not participant:
        return _json_response(404, {"error": "Participant not found in this meeting"})

    left_at = datetime.now(timezone.utc).isoformat()

    participants_table.update_item(
        Key={"meetingId": meeting_id, "userEmail": user_email},
        UpdateExpression="SET participantStatus = :status, leftAt = :leftAt",
        ExpressionAttributeValues={":status": "LEFT", ":leftAt": left_at},
    )

    return _json_response(
        200,
        {
            "message": "Left meeting",
            "meetingId": meeting_id,
            "userEmail": user_email,
            "participantStatus": "LEFT",
            "leftAt": left_at,
            "meetingStatus": meeting.get("status", "ACTIVE"),
        },
    )
