/**
 * Copyright 2018 F5 Networks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const assert = require('assert');

const sinon = require('sinon');

const DeclarationParser = require('../../nodejs/declarationParser');
const DiffHandler = require('../../nodejs/diffHandler');
const SystemHandler = require('../../nodejs/systemHandler');
const NetworkHandler = require('../../nodejs/networkHandler');
const DscHandler = require('../../nodejs/dscHandler');
const DeleteHandler = require('../../nodejs/deleteHandler');
const DeclarationHandler = require('../../nodejs/declarationHandler');

let parsedDeclarations;
let declarationWithDefaults;

const bigIpMock = {
    modify() {
        return Promise.resolve();
    }
};

describe('declarationHandler', () => {
    beforeEach(() => {
        parsedDeclarations = [];
        declarationWithDefaults = {};

        sinon.stub(DeclarationParser.prototype, 'parse').callsFake(function parse() {
            parsedDeclarations.push(this.declaration);
            return {
                parsedDeclaration: {
                    Common: {}
                }
            };
        });

        sinon.stub(DiffHandler.prototype, 'process').callsFake((declaration) => {
            declarationWithDefaults = declaration;
            return Promise.resolve(
                {
                    toUpdate: {},
                    toDelete: {}
                }
            );
        });

        sinon.stub(SystemHandler.prototype, 'process').resolves();
        sinon.stub(NetworkHandler.prototype, 'process').resolves();
        sinon.stub(DscHandler.prototype, 'process').resolves();
        sinon.stub(DeleteHandler.prototype, 'process').resolves();
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should parse declarations if not parsed', () => {
        return new Promise((resolve, reject) => {
            const newDeclaration = {
                name: 'new'
            };
            const state = {
                currentConfig: {
                    name: 'current'
                },
                originalConfig: {
                    Common: {}
                }
            };

            const declarationHandler = new DeclarationHandler(bigIpMock);
            declarationHandler.process(newDeclaration, state)
                .then(() => {
                    assert.strictEqual(parsedDeclarations.length, 2);
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should not parse declarations if parsed', () => {
        return new Promise((resolve, reject) => {
            const newDeclaration = {
                name: 'new',
                parsed: true,
                Common: {}
            };
            const state = {
                currentConfig: {
                    name: 'current'
                },
                originalConfig: {
                    Common: {}
                }
            };

            const declarationHandler = new DeclarationHandler(bigIpMock);
            declarationHandler.process(newDeclaration, state)
                .then(() => {
                    assert.strictEqual(parsedDeclarations.length, 1);
                    assert.strictEqual(parsedDeclarations[0].name, 'current');
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should apply defaults for missing items', () => {
        return new Promise((resolve, reject) => {
            const newDeclaration = {
                name: 'new',
                parsed: true,
                Common: {}
            };
            const state = {
                currentConfig: {
                    name: 'current'
                },
                originalConfig: {
                    Common: {
                        hostname: 'my.bigip.com',
                        DNS: {
                            foo: 'bar'
                        },
                        NTP: ['one', 'two']
                    }
                }
            };

            const declarationHandler = new DeclarationHandler(bigIpMock);
            declarationHandler.process(newDeclaration, state)
                .then(() => {
                    assert.strictEqual(
                        declarationWithDefaults.Common.hostname, state.originalConfig.Common.hostname
                    );
                    assert.deepEqual(
                        declarationWithDefaults.Common.DNS, state.originalConfig.Common.DNS
                    );
                    assert.deepEqual(
                        declarationWithDefaults.Common.NTP, state.originalConfig.Common.NTP
                    );
                    resolve();
                })
                .catch((err) => {
                    reject(err);
                });
        });
    });

    it('should report processing errors', () => {
        const errorMessage = 'this is a processing error';
        SystemHandler.prototype.process = () => {
            return Promise.reject(new Error(errorMessage));
        };

        return new Promise((resolve, reject) => {
            const newDeclaration = {
                name: 'new',
                parsed: true,
                Common: {}
            };
            const state = {
                currentConfig: {
                    name: 'current'
                },
                originalConfig: {
                    Common: {}
                }
            };

            const declarationHandler = new DeclarationHandler(bigIpMock);
            declarationHandler.process(newDeclaration, state)
                .then(() => {
                    reject(new Error('processing error should have been caught'));
                })
                .catch((err) => {
                    assert.strictEqual(err.message, errorMessage);
                    resolve();
                });
        });
    });
});

describe('AVR dependencies', () => {
    let isAvrProvisioned;
    function AvrBigIpMock() {
        return {
            modify: () => {
                return Promise.resolve();
            },
            replace: (path) => {
                if (path === '/tm/analytics/global-settings') {
                    assert(isAvrProvisioned, 'Trying to change AVR settings without AVR provisioned');
                }
                return Promise.resolve();
            },
            onboard: {
                provision: (data) => {
                    isAvrProvisioned = data.avr && data.avr !== 'none';
                    return Promise.resolve([]);
                }
            }
        };
    }

    beforeEach(() => {
        isAvrProvisioned = false;
    });

    it('should add analytics and avr provisioning in the same declaration', () => {
        const declaration = {
            parsed: true,
            Common: {
                Analytics: {
                    interval: 60
                },
                Provision: {
                    avr: 'nominal'
                }
            }
        };

        const state = {
            originalConfig: {
                Common: {}
            },
            currentConfig: {
                parsed: true,
                Common: {}
            }
        };
        const handler = new DeclarationHandler(new AvrBigIpMock());
        return handler.process(declaration, state);
    });

    it.skip('should remove analytics and avr provisioning in the same declaration', () => {
        isAvrProvisioned = true;
        const declaration = {
            parsed: true,
            Common: {}
        };

        const state = {
            originalConfig: {
                Common: {
                    Provision: {
                        avr: 'none'
                    }
                }
            },
            currentConfig: {
                parsed: true,
                Common: {
                    Analytics: {
                        interval: 60
                    },
                    Provision: {
                        avr: 'nominal'
                    }
                }
            }
        };
        const handler = new DeclarationHandler(new AvrBigIpMock());
        return handler.process(declaration, state)
            .then(() => {
                assert(!isAvrProvisioned, 'AVR was not de-provisioned');
            });
    });
});
