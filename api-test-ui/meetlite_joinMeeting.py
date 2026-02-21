import json
from datetime import datetime
import boto3


dynamodb = boto3.resource("dynamodb")
meetings = dynamodb.Table("Meetings")
participants = dynamodb.Table("Participants")


def lambda_handler(event, context):
    body = json.loads(event["body"])
    meeting_id = body["meetingId"]
    user_id = body["userId"]

    meeting = meetings.get_item(Key={"meetingId": meeting_id})

    if "Item" not in meeting:
        return {"statusCode": 404, "body": "Meeting not found"}

    if meeting["Item"]["status"] != "ACTIVE":
        return {"statusCode": 400, "body": "Meeting not active"}

    participants.put_item(
        Item={
            "meetingId": meeting_id,
            "userEmail": user_id,
            "joinedAt": datetime.utcnow().isoformat(),
            "role": "PARTICIPANT",
        }
    )

    return {
        "statusCode": 200,
        "body": json.dumps({"message": "Joined meeting"}),
    }
