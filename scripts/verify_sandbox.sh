#!/bin/bash
# ==============================================================================
# Script: scripts/verify_sandbox.sh
# Mục đích: Chạy các kiểm tra Level 1 SAFE READ-ONLY trên AWS CloudShell / Lab IDE
# Tác giả: M1 - Minh Lý
# Tuân thủ: docs/plans/SANDBOX-VALIDATION-RUNBOOK.md
# ==============================================================================

set -e

REGION="us-east-1"
echo "========================================================================"
echo "          AWS ACADEMY SANDBOX - LEVEL 1 SAFE CAPABILITY AUDIT           "
echo "========================================================================"
echo "Target Region: $REGION"
echo "Thời gian: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

echo "--- 1. Caller Identity ---"
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json || echo "[FAILED] Không thể lấy caller identity"
echo ""

echo "--- 2. Configured Region ---"
CURRENT_REGION=$(aws configure get region || echo "not-configured")
echo "Configured Region: $CURRENT_REGION"
if [ "$CURRENT_REGION" != "us-east-1" ]; then
  echo "[WARNING] Cần chuyển region sang us-east-1 (aws configure set region us-east-1)"
fi
echo ""

echo "--- 3. Kiểm tra LabRole ---"
aws iam get-role --role-name LabRole --query 'Role.{RoleName:RoleName,Arn:Arn}' --output json || echo "[FAILED] Không tìm thấy LabRole"
echo ""

echo "--- 4. Kiểm tra quyền Lambda (List Functions) ---"
aws lambda list-functions --region "$REGION" --query 'Functions[].{Name:FunctionName,Runtime:Runtime}' --output json || echo "[FAILED] Quyền lambda:ListFunctions bị từ chối"
echo ""

echo "--- 5. Kiểm tra quyền S3 (List Buckets) ---"
aws s3api list-buckets --query 'Buckets[].Name' --output json || echo "[FAILED] Quyền s3:ListAllMyBuckets bị từ chối"
echo ""

echo "--- 6. Kiểm tra quyền CloudFormation (List Stacks) ---"
aws cloudformation list-stacks --region "$REGION" --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE ROLLBACK_COMPLETE --query 'StackSummaries[].{Name:StackName,Status:StackStatus}' --output json || echo "[FAILED] Quyền cloudformation:ListStacks bị từ chối"
echo ""

echo "--- 7. Kiểm tra quyền SSM Parameter Store ---"
aws ssm describe-parameters --region "$REGION" --query 'Parameters[].{Name:Name,Type:Type}' --output json || echo "[FAILED] Quyền ssm:DescribeParameters bị từ chối"
echo ""

echo "--- 8. Kiểm tra quyền CloudWatch (Describe Alarms) ---"
aws cloudwatch describe-alarms --region "$REGION" --max-items 5 --query 'MetricAlarms[].AlarmName' --output json || echo "[FAILED] Quyền cloudwatch:DescribeAlarms bị từ chối"
echo ""

echo "--- 9. Kiểm tra quyền SNS (List Topics) ---"
aws sns list-topics --region "$REGION" --query 'Topics[].TopicArn' --output json || echo "[FAILED] Quyền sns:ListTopics bị từ chối"
echo ""

echo "========================================================================"
echo "           KIỂM TRA HOÀN TẤT - BẢN TÓM TẮT METADATA READ-ONLY           "
echo "========================================================================"
echo "Hãy copy kết quả trên và dán lại vào chat để phân tích Gate 0."

