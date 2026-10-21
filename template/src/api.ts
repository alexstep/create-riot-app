const API_URL = 'https://jsonplaceholder.typicode.com/'

export interface Photo {
  albumId: number
  id: number
  title: string
  url: string
  thumbnailUrl: string
}

export async function getPhotos(limit = 10): Promise<Photo[]> {
  const response = await fetch(`${API_URL}photos?_limit=${limit}`)
  if (!response.ok) {
    throw new Error(`Demo API answered ${response.status}`)
  }
  const data: unknown = await response.json()
  if (!Array.isArray(data)) return []
  return data as Photo[]
}
