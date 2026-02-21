import json
import uuid
from datetime import datetime, timedelta
import boto3


dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("Meetings")


def lambda_handler(event, context):
    body = json.loads(event["body"])

    meeting_id = str(uuid.uuid4())[:6]
    host_user_id = body["userId"]

    now = datetime.utcnow()
    expires_at = now + timedelta(hours=1)

    table.put_item(
        Item={
            "meetingId": meeting_id,
            "hostUserId": host_user_id,
            "createdAt": now.isoformat(),
            "expiresAt": expires_at.isoformat(),
            "status": "ACTIVE",
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "meetingId": meeting_id,
            "expiresAt": expires_at.isoformat(),
        }),
    }
