# Runners Onboarding

Runners should be configured through the general app settings


## Workflow

1. Runner boots up with env variables pointed at the backend.
2. (Optional) Runner is configured with the API’s public key and asks the Backend to verify it is the correct backend
3. Runner requests to the backend to join with details such as its IP/MAc address ,system configuration, operating system etc. Especially available harnesses and models
4. User in system settings sees the new request and can either accept or deny in ui
5. Automatic handshake occurs setting up a secure channel between the two services.
6. User can load projects onto runner
7. runner requests tasks