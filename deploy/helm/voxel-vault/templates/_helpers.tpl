{{- define "voxel-vault.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "voxel-vault.fullname" -}}
{{- if .Values.fullnameOverride -}}{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}{{- else -}}{{ printf "%s-%s" .Release.Name (include "voxel-vault.name" .) | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- end -}}
{{- define "voxel-vault.labels" -}}
app.kubernetes.io/name: {{ include "voxel-vault.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "voxel-vault.serviceAccountName" -}}
{{- default (include "voxel-vault.fullname" .) .Values.serviceAccount.name -}}
{{- end -}}
{{/* Application secrets: VSO writes this Secret from Vault; with existingSecret it is created by hand. */}}
{{- define "voxel-vault.secretName" -}}
{{- .Values.secrets.existingSecret -}}
{{- end -}}
