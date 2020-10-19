/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as SDK from 'aws-sdk'
import { SsoCredentialProvider } from '../../../credentials/providers/ssoCredentialProvider'
import { SsoAccessTokenProvider } from '../../../credentials/sso/ssoAccessTokenProvider'
import { DiskCache } from '../../../credentials/sso/diskCache'
import { GetRoleCredentialsResponse } from 'aws-sdk/clients/sso'

describe('SsoCredentialProvider', () => {
    describe('refreshCredentials', () => {
        let sandbox = sinon.createSandbox()

        const ssoRegion = 'dummyRegion'
        const ssoUrl = '123abc.com/start'
        const ssoOidcClient = new SDK.SSOOIDC()
        const cache = new DiskCache()
        const ssoAccessTokenProvider = new SsoAccessTokenProvider(ssoRegion, ssoUrl, ssoOidcClient, cache)

        const ssoAccount = 'dummyAccount'
        const ssoRole = 'dummyRole'
        const ssoClient = new SDK.SSO()
        const sut = new SsoCredentialProvider(ssoAccount, ssoRole, ssoClient, ssoAccessTokenProvider)

        const HOUR_IN_MS = 3600000
        const validAccessToken = {
            startUrl: ssoUrl,
            region: ssoRegion,
            accessToken: 'dummyAccessToken',
            expiresAt: new Date(Date.now() + HOUR_IN_MS).toISOString(),
        }

        afterEach(() => {
            sandbox.restore()
        })

        it('should invalidate cached access token if denied', async () => {
            const stubAccessToken = sandbox.stub(ssoAccessTokenProvider, 'accessToken').resolves(validAccessToken)
            const stubSsoClient = sandbox.stub(ssoClient, 'getRoleCredentials')
            stubSsoClient.returns(({
                promise: sandbox.stub().throws({ code: 'UnauthorizedException' }),
            } as any) as SDK.Request<GetRoleCredentialsResponse, SDK.AWSError>)

            const stubInvalidate = sandbox.stub(cache, 'invalidateAccessToken').returns()
            try {
                await sut.refreshCredentials()
            } catch (err) {
                assert.strictEqual(stubInvalidate.called, true)
            }
            assert.strictEqual(stubAccessToken.called, true, 'access token was not called')
            assert.strictEqual(stubSsoClient.called, true, 'ssoClient was not called')
        })

        it('should return valid credentails', async () => {
            sandbox.stub(ssoAccessTokenProvider, 'accessToken').resolves(validAccessToken)
            const response: GetRoleCredentialsResponse = {
                roleCredentials: {
                    accessKeyId: 'dummyAccessKeyId',
                    secretAccessKey: 'dummySecretAccessKey',
                    sessionToken: 'dummySessionToken',
                },
            }
            const stubSsoClient = sandbox.stub(ssoClient, 'getRoleCredentials')
            stubSsoClient.returns(({
                promise: sandbox.stub().resolves(response),
            } as any) as SDK.Request<GetRoleCredentialsResponse, SDK.AWSError>)

            const receivedCredentials = await sut.refreshCredentials()

            assert.strictEqual(receivedCredentials.accessKeyId, 'dummyAccessKeyId')
            assert.strictEqual(receivedCredentials.secretAccessKey, 'dummySecretAccessKey')
            assert.strictEqual(receivedCredentials.sessionToken, 'dummySessionToken')
        })
    })
})