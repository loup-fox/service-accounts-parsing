#!/usr/local/bin/bash

# This script is used for the initial deployment of a repository.

# /!\ CHANGE THOSE VALUES
AWS_REGIONS="eu-central-1" # Regions where the project will be deployed.
STACK="foxbrain" # Stack of the project
ENVIRONMENTS="sandbox" # environments where the project will be deployed.

# No changes below
TEMPLATE_NAME="template-project-backend"
REPO_NAME=${PWD##*/}
STACK_LOWER=$(echo $STACK | awk '{print tolower($0)}')

# Bash needs to be v4 for associative arrays to be available.
# on mac, /bin/bash is v3 and /usr/local/bin/bash is v5.
declare -A AWS_ACCOUNTS
AWS_ACCOUNTS[sandbox]=854256730829
AWS_ACCOUNTS[staging]=706462094201
AWS_ACCOUNTS[production]=937261959512
AWS_ACCOUNTS[billing]=770795456108

echo "INFO: Detected repository name: ${REPO_NAME}"

echo "INFO: Matches detected:"
fgrep -R --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* ${TEMPLATE_NAME} .
fgrep -R --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* \"DevOps\" .

echo "INFO: Modifiying the files."
grep -lr --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* ${TEMPLATE_NAME} . | xargs sed -i -e "s/${TEMPLATE_NAME}/${REPO_NAME}/g"
grep -lr --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* \"DevOps\" . | xargs sed -i -e "s/\"DevOps\"/\"${STACK}\"/g"
find . -type f -regex ".*-e" -exec rm -f {} \;

echo "INFO: Matches detected after modifications (should be empty):"
fgrep -R --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* ${TEMPLATE_NAME} .
fgrep -R --exclude=./.git/* --exclude=./*/.terraform/* --exclude=./init_repo.sh --exclude=./src/* \"DevOps\" .

# Terraform project initialization
for INFRA_PROJECT in databases/clusters databases/permissions terraform
do
  cd infrastructure/${INFRA_PROJECT}
  terraform init -upgrade
  for ENVV in ${ENVIRONMENTS}
  do
    terraform workspace new $ENVV
  done
    cd $OLDPWD
done

# Vault secrets creation
echo "INFO: Creating Vault Values"
for EVT in ${ENVIRONMENTS}
do
  VAULT_SECRET_PATH=${EVT}/secret/${STACK_LOWER}/${REPO_NAME}
  VAULT_ENV_PATH=${EVT}/env/${STACK_LOWER}/${REPO_NAME}
  echo "INFO: Creating Vault Values in environment ${EVT} - global"

  echo -n '{"secret": {} }' |
    vault kv put -cas=0 ${VAULT_SECRET_PATH}/global/kubernetes -
  echo -n '{"env": {} }' |
    vault kv put -cas=0 ${VAULT_ENV_PATH}/global/kubernetes -
  for AWS_REGION in ${AWS_REGIONS}
  do
    echo "INFO: Creating Vault Values in environment ${EVT} - region ${AWS_REGION}"
    echo -n '{"secret": {}}' |
      vault kv put -cas=0 ${VAULT_SECRET_PATH}/aws_${AWS_REGION}/kubernetes -
    echo -n '{"cloud": {"aws": {"region": "'${AWS_REGION}'"}, "gcp": {"projectName": "cleanfox-'${EVT}'", "bigqueryDataProjectName": "cleanfox-'${EVT}'", "bigqueryExecutionProjectName": "cleanfox-'${EVT}'"} } }' |
      vault kv put -cas=0 ${VAULT_ENV_PATH}/aws_${AWS_REGION}/kubernetes -
  done
done