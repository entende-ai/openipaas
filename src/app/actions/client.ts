"use server"

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import crypto from 'crypto'

export async function createClient(formData: FormData) {
  const name = formData.get('name') as string

  if (!name) return { error: 'Name is required' }

  await prisma.client.create({
    data: { name }
  })

  revalidatePath('/dashboard/clients')
  return { success: true }
}

export async function generateApiKey(clientId: string) {
  const key = `oip_live_${crypto.randomBytes(16).toString('hex')}`

  await prisma.apiKey.create({
    data: {
      key,
      clientId
    }
  })

  revalidatePath('/dashboard/clients')
  return { success: true }
}
