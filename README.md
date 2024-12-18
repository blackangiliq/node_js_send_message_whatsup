WhatsApp Web API - Documentation
Summary

This API allows you to interact with WhatsApp Web through a server-side application built using Express, the whatsapp-web.js library, and QR code generation for authentication. The API allows you to create and manage WhatsApp sessions, send messages to users, and gather group information, among other features.
Key Features

    Session Management:
        Create a session with WhatsApp Web.
        Retrieve the current status of a session.
        List active sessions and delete sessions when needed.
        Handle session restoration and manage session persistence.

    Message Sending:
        Send text messages to individual contacts or groups.
        Simulate human-like typing behavior when sending messages.

    Group Management:
        Retrieve information about WhatsApp groups, including participants and descriptions.

    Status & Screenshot:
        Get the WhatsApp client’s status.
        Capture screenshots of the WhatsApp Web interface.

API Endpoints
1. Session Management
Create a Session

    Endpoint: /api/session/create

    Method: GET

    Description: Creates a new session and generates a QR code for authentication.

    Query Parameters:
        sessionId: Unique session identifier.
        webhookUrl (optional): A webhook URL to receive status updates.

    Response:
        If successful: Returns the session status and QR code if available.
        If failure: Returns an error message.

Session Status

    Endpoint: /api/session/status

    Method: GET

    Description: Retrieves the current status of a session.

    Query Parameters:
        session: The session ID.

    Response:
        Returns the session status (READY, WAITING_FOR_SCAN, etc.) and the last active time.

List Active Sessions

    Endpoint: /api/session/list

    Method: GET

    Description: Lists all active sessions.

    Response:
        Returns a list of all active sessions with their status and webhook URL.

Delete a Session

    Endpoint: /api/session/delete

    Method: GET

    Description: Deletes a specified session and clears its data.

    Query Parameters:
        sessionId: The session ID to be deleted.

    Response:
        Returns a success message if the session was deleted.

2. Message Sending
Send a Text Message

    Endpoint: /api/sendText

    Method: GET

    Description: Sends a text message to a specified phone number or group.

    Query Parameters:
        phone: Phone number or group ID in E.164 format (e.g., 9647729379356 for an individual or 9647729379356@g.us for a group).
        text: The text message to be sent.
        session: The session ID.

    Response:
        Returns the message ID if the message was successfully sent.

3. Group Management
Get Groups Information

    Endpoint: /api/groups

    Method: GET

    Description: Retrieves all groups associated with the current session.

    Response:
        Returns a list of groups with information such as name, number of participants, and description.

Get Group Info

    Endpoint: /api/groups/info

    Method: GET

    Description: Retrieves detailed information about a specific group.

    Query Parameters:
        groupId: The ID of the group.

    Response:
        Returns group details, including participants.

4. Status & Screenshot
Get WhatsApp Client State

    Endpoint: /api/status

    Method: GET

    Description: Retrieves the current state of the WhatsApp client.

    Response:
        Returns the state of the WhatsApp Web client.

Screenshot

    Endpoint: /api/screenshot

    Method: GET

    Description: Captures a screenshot of the WhatsApp Web interface.

    Response:
        Returns the screenshot in JPEG format.

Session Management Details
Session Creation

To initiate a new session, use the /api/session/create endpoint with a unique session ID. This will generate a QR code, which needs to be scanned via WhatsApp Web to authenticate the session.
Restoring a Session

If a session was previously created and saved, it can be restored using the session ID. This ensures that the session is reinitialized without the need for rescanning the QR code, unless it was disconnected.
Session Status

Each session can have one of the following statuses:

    INITIALIZING: The session is in the process of being created.
    WAITING_FOR_SCAN: Waiting for QR code scanning.
    READY: The session is authenticated and ready for use.
    AUTH_FAILED: Authentication failed.
    DISCONNECTED: The session is disconnected but can be reinitialized.

Message Sending Details
Sending Messages

Once a session is ready, you can send messages to users and groups using the /api/sendText endpoint. The phone number should be provided in the E.164 format for individual users (e.g., 9647729379356), or in a group format (e.g., 9647729379356@g.us).
Simulating Typing

For a more human-like interaction, the API can simulate typing behavior before sending a message. This is achieved by introducing a delay proportional to the message length.
Requirements

    Node.js: The application is built with Node.js, so ensure it is installed.
    Dependencies: Install necessary packages by running:



```npm install express whatsapp-web.js qrcode-terminal fs path```
