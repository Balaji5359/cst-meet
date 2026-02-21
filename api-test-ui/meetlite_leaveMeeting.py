import json
from datetime import datetime
import boto3


dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("MeetLiteMeetings")


def lambda_handler(event, context):
    meeting_id = event["queryStringParameters"]["meetingId"]

    res = table.get_item(Key={"meetingId": meeting_id})
    if "Item" not in res:
        return {"statusCode": 404, "body": "Meeting not found"}

    meeting = res["Item"]
    now = datetime.utcnow()

    if now.isoformat() > meeting["expiresAt"]:
        meeting["status"] = "EXPIRED"
        table.update_item(
            Key={"meetingId": meeting_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "EXPIRED"},
        )

    return {
        "statusCode": 200,
        "body": json.dumps({"status": meeting["status"]}),
    }
