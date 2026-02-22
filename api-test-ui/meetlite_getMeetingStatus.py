import json
from urllib.parse import parse_qs
import boto3
from boto3.dynamodb.conditions import Key


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
        return {}

    if isinstance(raw_body, str):
        raw_body = raw_body.strip()
        if not raw_body:
            return {}
        try:
            parsed = json.loads(raw_body)
        except json.JSONDecodeError:
            return {}
    elif isinstance(raw_body, dict):
        parsed = raw_body
    else:
        return {}

    if isinstance(parsed, dict) and "body" in parsed and isinstance(parsed["body"], str):
        try:
            parsed = json.loads(parsed["body"])
        except json.JSONDecodeError:
            return {}

    return parsed if isinstance(parsed, dict) else {}


def _extract_meeting_id(event):
    event = event or {}

    body = _parse_body(event)
    meeting_id = (body.get("meetingId") or "").strip()
    if meeting_id:
        return meeting_id

    params = event.get("queryStringParameters") or {}
    meeting_id = (params.get("meetingId") or "").strip()
    if meeting_id:
        return meeting_id

    multi_params = event.get("multiValueQueryStringParameters") or {}
    values = multi_params.get("meetingId") or []
    if values and isinstance(values, list):
        meeting_id = (values[0] or "").strip()
        if meeting_id:
            return meeting_id

    raw_query = (event.get("rawQueryString") or "").strip()
    if raw_query:
        parsed_query = parse_qs(raw_query)
        values = parsed_query.get("meetingId") or []
        if values:
            meeting_id = (values[0] or "").strip()
            if meeting_id:
                return meeting_id

    params_obj = event.get("params") or {}
    query_obj = params_obj.get("querystring") or {}
    meeting_id = (query_obj.get("meetingId") or "").strip()
    if meeting_id:
        return meeting_id

    path_params = event.get("pathParameters") or {}
    return (path_params.get("meetingId") or "").strip()


def _get_active_participants(meeting_id, host_user_id):
    response = participants_table.query(
        KeyConditionExpression=Key("meetingId").eq(meeting_id),
    )

    items = response.get("Items", [])
    while "LastEvaluatedKey" in response:
        response = participants_table.query(
            KeyConditionExpression=Key("meetingId").eq(meeting_id),
            ExclusiveStartKey=response["LastEvaluatedKey"],
        )
        items.extend(response.get("Items", []))

    active = []
    seen = set()

    for item in items:
        status = item.get("participantStatus", "ACTIVE")
        if status != "ACTIVE":
            continue

        email = (item.get("userEmail") or "").strip()
        if not email:
            continue

        key = email.lower()
        if key in seen:
            continue
        seen.add(key)

        is_host = host_user_id and email.lower() == host_user_id.lower()
        active.append(
            {
                "userEmail": email,
                "participantStatus": "ACTIVE",
                "joinedAt": item.get("joinedAt"),
                "role": "ADMIN" if is_host else item.get("role", "PARTICIPANT"),
                "isHost": bool(is_host),
            }
        )

    return active


def lambda_handler(event, context):
    meeting_id = _extract_meeting_id(event)

    if not meeting_id:
        return _json_response(400, {"error": "meetingId is required"})

    meeting = meetings_table.get_item(Key={"meetingId": meeting_id}).get("Item")
    if not meeting:
        return _json_response(404, {"error": "Meeting not found"})

    host_user_id = (meeting.get("hostUserId") or "").strip()
    participants = _get_active_participants(meeting_id, host_user_id)

    return _json_response(
        200,
        {
            "meetingId": meeting_id,
            "status": meeting.get("status", "ACTIVE"),
            "hostUserId": host_user_id,
            "participants": participants,
            "participantsCount": len(participants),
        },
    )
