import json
import boto3


dynamodb = boto3.resource("dynamodb")
MEETINGS_TABLE = dynamodb.Table("Meetings")


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    meeting_id = params.get("meetingId")

    if not meeting_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "meetingId query param required"}),
        }

    meeting = MEETINGS_TABLE.get_item(Key={"meetingId": meeting_id}).get("Item")

    if not meeting:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": "Meeting not found"}),
        }

    return {
        "statusCode": 200,
        "body": json.dumps({
            "meetingId": meeting_id,
            "status": meeting["status"],
        }),
    }
