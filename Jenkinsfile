#!/usr/bin/env groovy

node {
  def SCM_VARS
  def FAILURE = null

  def BASE_IMAGE = "${GITLAB_INNERSOURCE_REGISTRY}/devops/containers/node:8"
  def DEPLOY_IMAGE = "${GITLAB_INNERSOURCE_REGISTRY}/ghsc/hazdev/earthquake-design-ws"
  def IMAGE_VERSION = 'latest'
  def LOCAL_IMAGE = 'local/earthquake-design-ws:latest'


  try {
    stage('Setup') {
      def url
      def urlBase

      cleanWs()

      SCM_VARS = checkout scm

      if (GIT_BRANCH != '') {
        sh "git checkout --detach ${GIT_BRANCH}"

        SCM_VARS.GIT_BRANCH = GIT_BRANCH
        SCM_VARS.GIT_COMMIT = sh(
          returnStdOut: true,
          script: 'git rev-parse HEAD'
        )
      }

      // Determine deploy version tag to use
      if (SCM_VARS.GIT_BRANCH != 'origin/master') {
        IMAGE_VERSION = SCM_VARS.GIT_BRANCH.split('/').last().replace(' ', '_')
      }

      urlBase = SCM_VARS.GIT_URL.replace('.git', '/commit/')
      url = "<a href=\"${urlBase}/${SCM_VARS.GIT_COMMIT}\" target=\"_blank\">${SCM_VARS.GIT_COMMIT}</a>"
      writeFile encoding: 'UTF-8', file: '.REVISION', text: "${url}"

      ansiColor('xterm') {
        sh """
          mkdir -p ${WORKSPACE}/coverage;
          mkdir -p ${WORKSPACE}/node_modules;
        """
      }
    }

    stage('Scan Dependencies') {
      docker.image(BASE_IMAGE).inside() {
        // Create dependencies
        withEnv([
          'npm_config_cache=/tmp/npm-cache',
          'HOME=/tmp',
          'NON_INTERACTIVE=true'
        ]) {
          ansiColor('xterm') {
            sh """
              source /etc/profile.d/nvm.sh > /dev/null 2>&1;
              npm config set package-lock false;

              # Using --production installs dependencies but not devDependencies
              npm install --production
            """
          }
        }

        ansiColor('xterm') {
          dependencyCheckAnalyzer(
            datadir: '',
            hintsFile: '',
            includeCsvReports: false,
            includeHtmlReports: true,
            includeJsonReports: false,
            includeVulnReports: true,
            isAutoupdateDisabled: false,
            outdir: 'dependency-check-data',
            scanpath: 'node_modules',
            skipOnScmChange: false,
            skipOnUpstreamChange: false,
            suppressionFile: '',
            zipExtensions: ''
          )
        }

        // Publish results
        dependencyCheckPublisher(
          canComputeNew: false,
          defaultEncoding: '',
          healthy: '',
          pattern: '**/dependency-check-report.xml',
          unHealthy: ''
        )

        publishHTML (target: [
          allowMissing: true,
          alwaysLinkToLastBuild: true,
          keepAll: true,
          reportDir: 'dependency-check-data',
          reportFiles: 'dependency-check-report.html',
          reportName: 'Dependency Analysis'
        ])

        publishHTML (target: [
          allowMissing: true,
          alwaysLinkToLastBuild: true,
          keepAll: true,
          reportDir: 'dependency-check-data',
          reportFiles: 'dependency-check-vulnerability.html',
          reportName: 'Dependency Vulnerabilities'
        ])
      }
    }

    stage('Build Image') {
      ansiColor('xterm') {
        sh """
          docker build \
            --build-arg BASE_IMAGE=${BASE_IMAGE} \
            -t ${LOCAL_IMAGE} .
        """
      }
    }

    stage('Unit Tests') {
      ansiColor('xterm') {
        sh """
          docker run --rm \
            -v ${WORKSPACE}/coverage:/hazdev-project/coverage \
            ${LOCAL_IMAGE} \
            /bin/bash -c 'npm run coverage'
        """
      }

      cobertura(
        autoUpdateHealth: false,
        autoUpdateStability: false,
        coberturaReportFile: '**/cobertura-coverage.xml',
        conditionalCoverageTargets: '70, 0, 0',
        failUnhealthy: false,
        failUnstable: false,
        lineCoverageTargets: '80, 0, 0',
        maxNumberOfBuilds: 0,
        methodCoverageTargets: '80, 0, 0',
        onlyStable: false,
        sourceEncoding: 'ASCII',
        zoomCoverageChart: false
      )
    }

    stage('Penetration Tests') {
      echo 'TODO :: Penetration Tests'
    }

    stage('Publish Image') {
      docker.withRegistry(
        "https://${GITLAB_INNERSOURCE_REGISTRY}",
        'gitlab-innersource-admin'
      ) {
        ansiColor('xterm') {
          sh """
            docker tag \
              ${LOCAL_IMAGE} \
              ${DEPLOY_IMAGE}:${IMAGE_VERSION}
          """

          sh """
            docker push ${DEPLOY_IMAGE}:${IMAGE_VERSION}
          """
        }
      }
    }

    stage('Trigger Deploy') {
      build(
        job: 'deploy-ws',
        parameters: [
          string(name: 'IMAGE_VERSION', value: IMAGE_VERSION)
        ]
      )
    }
  } catch (e) {
    mail to: 'emartinez@usgs.gov',
      from: 'noreply@jenkins',
      subject: "Jenkins Failed: ${env.JOB_NAME} [${env.BUILD_NUMBER}]'",
      body: "Project build (${BUILD_TAG}) failed '${e}'"

    FAILURE = e
  } finally {
    stage('Cleanup') {
      echo 'TODO'
      sh """
        set +e;

        docker container rm --force \
          ${OWASP_CONTAINER} \
        ;

        docker image rm --force \
          ${DEPLOY_IMAGE} \
          ${LOCAL_IMAGE} \
        ;

        exit 0;
      """
      if (FAILURE) {
        currentBuild.result = 'FAILURE'
        throw FAILURE
      }
    }
  }
}
