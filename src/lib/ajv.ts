import * as Ajv from 'ajv'

export default function ajvPlugin(ajv: Ajv.default) {
  const regex = /^[0-9a-hjkmnp-tv-z]{26}$/

  ajv.addFormat('ulid', {
    type: 'string',
    validate: value =>
      typeof value === 'string' && value.length === 26 && regex.test(value),
  })
}
