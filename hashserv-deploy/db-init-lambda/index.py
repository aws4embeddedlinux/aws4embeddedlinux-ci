"""
CloudFormation Custom Resource Lambda: Create PostgreSQL databases.

Handles Create/Update/Delete events for per-release hashserv databases.
Idempotent: safe to re-run (uses IF NOT EXISTS equivalent).
"""

import json
import logging
import os

import boto3
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import cfnresponse

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_db_credentials():
    """Retrieve database credentials from Secrets Manager."""
    sm = boto3.client("secretsmanager")
    secret = sm.get_secret_value(SecretId=os.environ["SECRET_ARN"])
    return json.loads(secret["SecretString"])


def get_connection(creds):
    """Connect to the default database (postgres) for admin operations."""
    conn = psycopg2.connect(
        host=creds["host"],
        port=creds.get("port", 5432),
        user=creds["username"],
        password=creds["password"],
        dbname="postgres",  # Connect to default DB for CREATE DATABASE
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    return conn


def create_databases(databases, creds):
    """Create databases if they don't exist."""
    conn = get_connection(creds)
    cur = conn.cursor()

    results = []
    for db_name in databases:
        try:
            # Check if database exists
            cur.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (db_name,)
            )
            if cur.fetchone():
                logger.info(f"Database '{db_name}' already exists, skipping.")
                results.append(f"{db_name}: exists")
            else:
                cur.execute(f'CREATE DATABASE "{db_name}"')
                logger.info(f"Created database '{db_name}'.")
                results.append(f"{db_name}: created")
        except Exception as e:
            logger.error(f"Error creating database '{db_name}': {e}")
            results.append(f"{db_name}: error - {e}")
            raise

    cur.close()
    conn.close()
    return results


def delete_databases(databases, creds):
    """
    Delete databases. Called on stack deletion.
    We choose NOT to drop databases to prevent data loss.
    """
    logger.info(
        f"Delete requested for databases {databases}. "
        "Skipping deletion to preserve data. "
        "Drop manually if needed."
    )
    return [f"{db}: retained" for db in databases]


def handler(event, context):
    """CloudFormation Custom Resource handler."""
    logger.info(f"Event: {json.dumps(event)}")

    request_type = event["RequestType"]
    properties = event["ResourceProperties"]
    databases = properties.get("Databases", [])

    try:
        creds = get_db_credentials()

        if request_type == "Create":
            results = create_databases(databases, creds)
        elif request_type == "Update":
            # On update, ensure all databases exist (idempotent create)
            results = create_databases(databases, creds)
        elif request_type == "Delete":
            results = delete_databases(databases, creds)
        else:
            results = [f"Unknown request type: {request_type}"]

        cfnresponse.send(
            event,
            context,
            cfnresponse.SUCCESS,
            {"Results": json.dumps(results)},
        )

    except Exception as e:
        logger.error(f"Failed: {e}")
        cfnresponse.send(
            event,
            context,
            cfnresponse.FAILED,
            {"Error": str(e)},
        )
