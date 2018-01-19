const tape = require('tape');
const request = require('request');
const Ajv = require('ajv');
const schema = require('../schema/source_schema.json');

const ajv = new Ajv();
ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'), "http://json-schema.org/draft-04/schema#");
ajv.addMetaSchema(require('./geojson.json'), "http://json.schemastore.org/geojson#/definitions/geometry");
testSchemaItself(ajv.compile(schema));

const nonStringValues = [null, 17, {}, [], true];
const nonBooleanValues = [null, 17, {}, [], 'string'];

// this function instructs Ajv on how to load remote sources
function loadSchema(uri) {
    request.json(uri, (err, res, body) => {
        if (err || res.statusCode >= 400) throw err || new Error(`Loading error: ${res.statusCode}`);
        return body;
    });
}

// convenience function that looks for an additionalProperty error condition
// anywhere in the errors array
function isAdditionalPropertyError(validate, dataPath, property) {
    if (!validate.errors) return false;

    return validate.errors.some(err => {
      return err.keyword === 'additionalProperties' &&
          err.dataPath === dataPath &&
          err.params.additionalProperty === property;
    });

}

// convenience function that looks for an incorrect type error condition
// anywhere in the errors array
function isEnumValueError(validate, property) {
    if (!validate.errors) return false;

    return validate.errors.some((err) => {
        return err.schemaPath === `#/properties/${property}/enum`;
    });
}

// convenience function that looks for an missingProperty error condition
// anywhere in the errors array
function isMissingPropertyError(validate, dataPath, fieldName) {
    if (!validate.errors) return false;

    return validate.errors.some(err => {
        return err.dataPath === dataPath &&
          err.params.missingProperty === fieldName
    });

}

// convenience function that looks for an type error condition
// anywhere in the errors array
function isTypeError(validate, dataPath) {
  if (!validate.errors) return false;

  return validate.errors.some(err => {
    return err.keyword === 'type' && err.dataPath === dataPath;
  });

}

function isOneOfError(validate, property) {
    if (!validate.errors) return false;

    return validate.errors.some((err) => {
        return err.schemaPath === `#/properties/${property}/oneOf`;
    });
}

function isFormatError(validate, property) {
    if (!validate.errors) return false;

    return validate.errors.some((err) => {
        return err.schemaPath === `#/properties/${property}/format`;
    });
}

function isPatternError(validate, property) {
    if (!validate.errors) return false;

    return validate.errors.some((err) => {
        return err.schemaPath === `#/properties/${property}/pattern`;
    });
}

function testSchemaItself(validate) {
    tape('test schema itself', (test) => {
        test.test('bare minimum source should pass', (t) => {
            ['http', 'ftp', 'ESRI'].forEach((type) => {
                const source = {
                    coverage: {
                        country: 'some country'
                    },
                    type: type,
                    data: 'http://xyz.com/'
                };

                const valid = validate(source);

                t.ok(valid, `type ${type} should pass`);

            });

            t.end();

        });

        test.test('coverage missing country should fail', (t) => {
            const source = {
                coverage: {
                },
                type: 'http',
                data: 'http://xyz.com/'
            };

            const valid = validate(source);

            t.notOk(valid, 'coverage missing country should fail');
            t.ok(isMissingPropertyError(validate, '.coverage', 'country'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('unknown field should fail', (t) => {
            const source = {
                coverage: {
                    country: 'some country'
                },
                type: 'http',
                data: 'http://xyz.com/',
                unknown_field: 'value'
            };

            const valid = validate(source);

            t.notOk(valid, 'type-less source should fail');
            t.ok(isAdditionalPropertyError(validate, '', 'unknown_field'), JSON.stringify(validate.errors));

            t.end();

        });

        test.test('type other than http/ftp/ESRI should fail', (t) => {
            const source = {
                coverage: {
                    country: 'some country'
                },
                type: 'non-http/ftp/ESRI',
                data: 'http://xyz.com/'
            };

            const valid = validate(source);

            t.notOk(valid, 'non-http/ftp/ESRI type should fail');
            t.ok(isEnumValueError(validate, 'type'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('source without type should fail', (t) => {
            const source = {
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/'
            };

            const valid = validate(source);

            t.notOk(valid, 'type-less source should fail');
            t.ok(isMissingPropertyError(validate, '', 'type'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('non-string data value should fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 17
            };

            const valid = validate(source);

            t.notOk(valid, 'non-string data value should fail');
            t.ok(isTypeError(validate, '.data'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('string data value should not fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/'
            };

            const valid = validate(source);

            t.ok(valid, 'string data value should not fail');
            t.end();

        });

        test.test('non-string website value should fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                website: 17
            };

            const valid = validate(source);

            t.notOk(valid, 'non-string website value should fail');
            t.ok(isTypeError(validate, '.website'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('string website value should not fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                website: 'this is a string'
            };

            const valid = validate(source);

            t.ok(valid, 'string website value should not fail');
            t.end();

        });

        test.test('non-string email value should fail', (t) => {
            [null, 17, {}, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    email: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string email value should fail');
                t.ok(isTypeError(validate, '.email'), JSON.stringify(validate.errors));

            });
            t.end();

        });

        test.test('non-email-formatted email field should fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                email: 'this is not a valid email address'
            };

            const valid = validate(source);

            t.notOk(valid, 'non-email email value should fail');
            t.ok(isFormatError(validate, 'email', JSON.stringify(validate.errors)));
            t.end();

        });

        test.test('email-formatted email field should not fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                email: 'me@example.com'
            };

            const valid = validate(source);

            t.ok(valid, 'email-formatted email value should not fail');
            t.end();

        });

        test.test('non-string compression should fail', (t) => {
            [null, 17, {}, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    compression: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string compression value should fail');
                t.ok(isTypeError(validate, '.compression'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('non-"zip" compression value should fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                compression: 'this value is not "zip"'
            };

            const valid = validate(source);

            t.notOk(valid, 'non-"zip" compression value should fail');
            t.ok(isEnumValueError(validate, 'compression'), JSON.stringify(validate.errors));
            t.end();

        });

        test.test('"zip" compression value should not fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                compression: 'zip'
            };

            const valid = validate(source);

            t.ok(valid, '"zip" compression value should not fail');
            t.end();

        });

        test.test('non-string attribution should fail', (t) => {
            [null, 17, {}, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    attribution: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string attribution value should fail');
                t.ok(isTypeError(validate, '.attribution'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('string attribution value should not fail', (t) => {
            const source = {
                type: 'http',
                coverage: {
                    country: 'some country'
                },
                data: 'http://xyz.com/',
                attribution: 'this is a string'
            };

            const valid = validate(source);

            t.ok(valid, 'string attribution value should not fail');
            t.end();

        });

        test.test('non-string language should fail', (t) => {
            [null, 17, {}, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    language: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string language value should fail');
                t.ok(isTypeError(validate, '.language'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('non-2- or 3-letter string language should fail', (t) => {
            ['a', 'a1', '1a', 'a a', 'aaaa'].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    language: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string language value should fail');
                t.ok(isPatternError(validate, 'language'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('case-insensitive 2- or 3-letter string language should not fail', (t) => {
            ['aa', 'Aa', 'aA', 'AA', 'aaa', 'en', 'gb', 'lld'].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    language: value
                };

                const valid = validate(source);

                t.ok(valid, '2- or 3-letter string language value should not fail');

            });

            t.end();

        });

        test.test('non-boolean skip should fail', (t) => {
            [null, 17, {}, [], 'string'].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    skip: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-boolean skip value should fail');
                t.ok(isTypeError(validate, '.skip'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('boolean skip should not fail', (t) => {
            [true, false].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    skip: value
                };

                const valid = validate(source);

                t.ok(valid, 'boolean skip value should not fail');

            });

            t.end();

        });

        test.test('non-string/integer year should fail', (t) => {
            [null, 17.3, {}, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    year: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string/integer year value should fail');
                t.ok(isOneOfError(validate, 'year'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('string/integer year should not fail', (t) => {
            [17, 'string'].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    year: value
                };

                const valid = validate(source);

                t.ok(valid, 'string/integer year value should not fail');

            });

            t.end();

        });

        test.test('non-string/object note should fail', (t) => {
            [null, 17, [], true].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    note: value
                };

                const valid = validate(source);

                t.notOk(valid, 'non-string/object note value should fail');
                t.ok(isOneOfError(validate, 'note'), JSON.stringify(validate.errors));

            });

            t.end();

        });

        test.test('string/integer note should not fail', (t) => {
            [{}, 'string'].forEach((value) => {
                const source = {
                    type: 'http',
                    coverage: {
                        country: 'some country'
                    },
                    data: 'http://xyz.com/',
                    note: value
                };

                const valid = validate(source);

                t.ok(valid, 'string/object note value should not fail');

            });

            t.end();

        });

    });

    tape('prefixed_number function tests', test => {
      test.test('missing field property should fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: {
                function: 'prefixed_number'
            },
            street: 'street field'
          }
        };

        const valid = validate(source);

        t.notOk(valid, 'missing field value should fail');
        t.ok(isMissingPropertyError(validate, '.conform.number', 'field'), JSON.stringify(validate.errors));
        t.end();

      });

      test.test('non-string field value should fail', t => {
        nonStringValues.forEach(value => {
          const source = {
            coverage: {
                country: 'some country'
            },
            type: 'ESRI',
            data: 'http://xyz.com/',
            conform: {
              type: 'geojson',
              number: {
                  function: 'prefixed_number',
                  field: value
              },
              street: 'street field'
            }
          };

          const valid = validate(source);

          t.notOk(valid, 'non-string field value should fail');
          t.ok(isTypeError(validate, '.conform.number.field'), JSON.stringify(validate.errors));

        });

        t.end();

      });

      test.test('string field value should not fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: {
                function: 'prefixed_number',
                field: 'number field'
            },
            street: 'street field'
          }
        };

        const valid = validate(source);

        t.ok(valid, 'string conform.number.field value should not fail');
        t.end();

      });

      test.test('unknown field should fail', t => {
        const source = {
            coverage: {
                country: 'some country'
            },
            type: 'http',
            data: 'http://xyz.com/',
            conform: {
              type: 'geojson',
              number: {
                  function: 'prefixed_number',
                  field: 'number field',
                  unknown_field: 'value'
              },
              street: 'street field'
            }

        };

        const valid = validate(source);

        t.notOk(valid, 'unknown field in prefixed_number should fail');
        t.ok(isAdditionalPropertyError(validate, '.conform.number', 'unknown_field'), JSON.stringify(validate.errors));
        t.end();

      });

    });

    tape('postfixed_street function tests', test => {
      test.test('missing field property should fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: 'number field',
            street: {
              function: 'postfixed_street'
            }
          }
        };

        const valid = validate(source);

        t.notOk(valid, 'missing field value should fail');
        t.ok(isMissingPropertyError(validate, '.conform.street', 'field'), JSON.stringify(validate.errors));
        t.end();

      });

      test.test('non-string field value should fail', t => {
        nonStringValues.forEach(value => {
          const source = {
            coverage: {
                country: 'some country'
            },
            type: 'ESRI',
            data: 'http://xyz.com/',
            conform: {
              type: 'geojson',
              number: 'number field',
              street: {
                function: 'postfixed_street',
                field: value
              }
            }
          };

          const valid = validate(source);

          t.notOk(valid, 'non-string field value should fail');
          t.ok(isTypeError(validate, '.conform.street.field'), JSON.stringify(validate.errors));

        });

        t.end();

      });

      test.test('string field value should not fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: 'number field',
            street: {
              function: 'postfixed_street',
              field: 'street field'
            }
          }
        };

        const valid = validate(source);

        t.ok(valid, 'string conform.street.field value should not fail');
        t.end();

      });

      test.test('non-boolean may_contain_units should fail', t => {
          nonBooleanValues.forEach(value => {
              const source = {
                  type: 'http',
                  coverage: {
                      country: 'some country'
                  },
                  data: 'http://xyz.com/',
                  conform: {
                    type: 'geojson',
                    number: 'number field',
                    street: {
                      function: 'postfixed_street',
                      field: 'street field',
                      may_contain_units: value
                    }
                  }
              };

              const valid = validate(source);

              t.notOk(valid, 'non-boolean may_contain_units value should fail');
              t.ok(isTypeError(validate, '.conform.street.may_contain_units'), JSON.stringify(validate.errors));

          });

          t.end();

      });

      test.test('boolean may_contain_units should not fail', t => {
          [true, false].forEach(value => {
              const source = {
                  type: 'http',
                  coverage: {
                      country: 'some country'
                  },
                  data: 'http://xyz.com/',
                  conform: {
                    type: 'geojson',
                    number: 'number field',
                    street: {
                      function: 'postfixed_street',
                      field: 'street field',
                      may_contain_units: value
                    }
                  }
              };

              const valid = validate(source);

              t.ok(valid, 'boolean may_contain_units value should not fail');

          });

          t.end();

      });

      test.test('unknown field should fail', (t) => {
          const source = {
              coverage: {
                  country: 'some country'
              },
              type: 'http',
              data: 'http://xyz.com/',
              conform: {
                type: 'geojson',
                number: 'number field',
                street: {
                  function: 'postfixed_street',
                  field: 'street field',
                  unknown_field: 'value'
                }
              }

          };

          const valid = validate(source);

          t.notOk(valid, 'unknown field in postfixed_street should fail');
          t.ok(isAdditionalPropertyError(validate, '.conform.street', 'unknown_field'), JSON.stringify(validate.errors));
          t.end();

      });

    });

    tape('postfixed_unit function tests', test => {
      test.test('missing field property should fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: 'number field',
            street: 'street field',
            unit: {
              function: 'postfixed_unit'
            }
          }
        };

        const valid = validate(source);

        t.notOk(valid, 'missing field value should fail');
        t.ok(isMissingPropertyError(validate, '.conform.unit', 'field'), JSON.stringify(validate.errors));
        t.end();

      });

      test.test('non-string field value should fail', t => {
        nonStringValues.forEach(value => {
          const source = {
            coverage: {
                country: 'some country'
            },
            type: 'ESRI',
            data: 'http://xyz.com/',
            conform: {
              type: 'geojson',
              number: 'number field',
              street: 'street field',
              unit: {
                function: 'postfixed_unit',
                field: value
              }
            }
          };

          const valid = validate(source);

          t.notOk(valid, 'non-string field value should fail');
          t.ok(isTypeError(validate, '.conform.unit.field'), JSON.stringify(validate.errors));

        });

        t.end();

      });

      test.test('string field value should not fail', t => {
        const source = {
          coverage: {
              country: 'some country'
          },
          type: 'ESRI',
          data: 'http://xyz.com/',
          conform: {
            type: 'geojson',
            number: 'number field',
            street: 'street field',
            unit: {
              function: 'postfixed_unit',
              field: 'street field'
            }
          }
        };

        const valid = validate(source);

        t.ok(valid, 'string conform.unit.field value should not fail');
        t.end();

      });

      test.test('unknown field should fail', t => {
        const source = {
            coverage: {
                country: 'some country'
            },
            type: 'http',
            data: 'http://xyz.com/',
            conform: {
              type: 'geojson',
              number: 'number field',
              street: 'street field',
              unit: {
                function: 'postfixed_unit',
                field: 'unit field',
                unknown_field: 'value'
              }
            }

        };

        const valid = validate(source);

        t.notOk(valid, 'unknown field in postfixed_unit should fail');
        t.ok(isAdditionalPropertyError(validate, '.conform.unit', 'unknown_field'), JSON.stringify(validate.errors));
        t.end();

      });

    });

}
